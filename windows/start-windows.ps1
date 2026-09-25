<#
.SYNOPSIS
  "windows" profile: runs Postgres-backed trade-api, trade-executor,
  trades-generator and auth-service natively on Windows, against a Kafka
  broker running in Docker on a Linux host (windows/kafka-linux.sh).

.DESCRIPTION
  1. Loads windows/.env.windows
  2. Preflight: java/mvn/node/npm/psql present, Kafka reachable over the LAN,
     Postgres reachable
  3. Creates the database if missing; applies the Sprint 3 schema + seed once
  4. Builds the three Spring jars and the NestJS service (skip with -SkipBuild)
  5. Starts them in dependency order, waits for each health endpoint, and
     checks that trade-executor actually joined its Kafka consumer group

  Logs:  windows/.run/logs/<service>.log (+ .err.log)
  Stop:  windows/stop-windows.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File windows\start-windows.ps1
  powershell -ExecutionPolicy Bypass -File windows\start-windows.ps1 -SkipBuild
#>
param(
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$WindowsDir = $PSScriptRoot
$RepoDir = Split-Path $WindowsDir -Parent
$EnvFile = Join-Path $WindowsDir '.env.windows'
$RunDir = Join-Path $WindowsDir '.run'
$LogDir = Join-Path $RunDir 'logs'
$PidFile = Join-Path $RunDir 'pids.json'

function Write-Stage([string]$Text) { Write-Host "== $Text ==" -ForegroundColor Cyan }
function Write-Pass([string]$Text) { Write-Host "PASS: $Text" -ForegroundColor Green }
function Fail([string]$Text) {
    Write-Host "FAIL: $Text" -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
if (-not (Test-Path $EnvFile)) {
    Fail "$EnvFile not found. Copy windows\.env.windows.example to windows\.env.windows and fill it in."
}

# KEY=VALUE per line; blank lines and # comments skipped. Empty values are
# skipped too: Windows can't hold an empty variable (setting "" deletes it),
# so the services see them as unset - the windows Spring profile gives every
# optional one a default.
foreach ($line in Get-Content $EnvFile) {
    $trimmed = $line.Trim()
    if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
    $idx = $trimmed.IndexOf('=')
    if ($idx -lt 1) { continue }
    $key = $trimmed.Substring(0, $idx).Trim()
    $value = $trimmed.Substring($idx + 1).Trim().Trim('"')
    if ($value -ne '') {
        [Environment]::SetEnvironmentVariable($key, $value, 'Process')
    }
}

function Get-Setting([string]$Name, [string]$Default) {
    $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if ([string]::IsNullOrEmpty($value)) { return $Default }
    return $value
}

$KafkaBootstrap = Get-Setting 'KAFKA_BOOTSTRAP_SERVERS' ''
$PgHost = Get-Setting 'POSTGRES_HOST' 'localhost'
$PgPort = Get-Setting 'POSTGRES_PORT' '5432'
$PgDb = Get-Setting 'POSTGRES_DB' 'tradedb'
$PgUser = Get-Setting 'POSTGRES_USER' 'postgres'
$JwtSecret = Get-Setting 'JWT_SECRET' ''
$MarketSim = (Get-Setting 'MARKET_SIM' 'false') -eq 'true'
$TradeApiPort = Get-Setting 'TRADE_API_PORT' '8080'
$ExecutorPort = Get-Setting 'TRADE_EXECUTOR_PORT' '8082'
$GeneratorPort = Get-Setting 'TRADES_GENERATOR_PORT' '8083'
$AuthPort = Get-Setting 'AUTH_SERVICE_PORT' '3000'

if ($KafkaBootstrap -eq '') { Fail 'KAFKA_BOOTSTRAP_SERVERS is not set in windows\.env.windows.' }
if ($KafkaBootstrap -match '^(localhost|127\.0\.0\.1):') {
    Write-Host "NOTE: KAFKA_BOOTSTRAP_SERVERS is $KafkaBootstrap - only right if Docker runs in WSL2 on this PC." -ForegroundColor Yellow
}
if ($JwtSecret.Length -lt 32) { Fail 'JWT_SECRET must be set and at least 32 characters.' }
# Plain identifier only: it goes into CREATE DATABASE unquoted.
if ($PgDb -cnotmatch '^[a-z_][a-z0-9_]*$') { Fail "POSTGRES_DB must be lowercase letters, digits and underscores (got '$PgDb')." }
foreach ($required in 'POSTGRES_PASSWORD') {
    if ((Get-Setting $required '') -eq '') { Fail "$required is not set in windows\.env.windows." }
}

# Every child process inherits these.
$env:POSTGRES_HOST = $PgHost
$env:POSTGRES_PORT = $PgPort
$env:POSTGRES_DB = $PgDb
$env:POSTGRES_USER = $PgUser
$env:PGPASSWORD = $env:POSTGRES_PASSWORD
$env:PGOPTIONS = '-c client_min_messages=warning'
$env:SPRING_PROFILES_ACTIVE = $(if ($MarketSim) { 'windows,market-sim' } else { 'windows' })

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Test-Tcp([string]$TargetHost, [int]$Port, [int]$TimeoutMs = 3000) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $connect = $client.BeginConnect($TargetHost, $Port, $null, $null)
        if (-not $connect.AsyncWaitHandle.WaitOne($TimeoutMs)) { return $false }
        $client.EndConnect($connect)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Find-Psql {
    $dir = Get-Setting 'PSQL_BIN_DIR' ''
    if ($dir -ne '' -and (Test-Path (Join-Path $dir 'psql.exe'))) { return (Join-Path $dir 'psql.exe') }
    $onPath = Get-Command psql -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }
    $installed = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
        Sort-Object { [int]($_.Directory.Parent.Name -replace '\D', '') } -Descending |
        Select-Object -First 1
    if ($installed) { return $installed.FullName }
    return $null
}

# Runs one psql command and returns trimmed stdout; fails the script on error.
function Invoke-Psql([string]$Database, [string[]]$PsqlArgs) {
    # -w: never stop at a password prompt - a wrong POSTGRES_PASSWORD fails fast.
    $allArgs = @('-h', $PgHost, '-p', $PgPort, '-U', $PgUser, '-d', $Database, '-w', '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A') + $PsqlArgs
    # Windows PowerShell 5.1 turns every stderr line of a native command into
    # an ErrorRecord when redirected, which 'Stop' would make fatal - even a
    # harmless NOTICE. Judge psql by its exit code instead.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $script:Psql @allArgs 2>&1 | ForEach-Object { "$_" }
    } finally {
        $ErrorActionPreference = $previous
    }
    if ($LASTEXITCODE -ne 0) { Fail "psql failed ($Database): $($output | Out-String)" }
    return (($output | Out-String).Trim())
}

function Wait-Http([string]$Name, [string]$Url, [string]$Pattern, [string]$LogName, [int]$TimeoutSec = 180) {
    $start = Get-Date
    $deadline = $start.AddSeconds($TimeoutSec)
    $nextNote = 10
    Write-Host "   waiting for $Name (up to ${TimeoutSec}s)..."
    while ((Get-Date) -lt $deadline) {
        try {
            # Accept: application/json - actuator otherwise answers with
            # application/vnd.spring-boot.actuator.v3+json, which Windows
            # PowerShell 5.1 treats as binary: .Content comes back as a
            # byte[] and would never match the pattern. Decode it anyway in
            # case some endpoint still sends a non-text type.
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 -Headers @{ Accept = 'application/json' }
            $body = $response.Content
            if ($body -is [byte[]]) { $body = [System.Text.Encoding]::UTF8.GetString($body) }
            if ($body -match $Pattern) {
                Write-Pass "$Name is up ($Url)"
                return
            }
        } catch {
            # 503 while DOWN, or connection refused while still booting
        }
        $elapsed = [int]((Get-Date) - $start).TotalSeconds
        if ($elapsed -ge $nextNote) {
            Write-Host "   ...still waiting for $Name (${elapsed}s) - log: $(Join-Path $LogDir "$LogName.log")"
            $nextNote += 20
        }
        $proc = $script:Started | Where-Object { $_.name -eq $LogName }
        if ($proc -and -not (Get-Process -Id $proc.pid -ErrorAction SilentlyContinue)) {
            Show-LogTail $LogName
            Fail "$Name exited during startup."
        }
        Start-Sleep -Seconds 2
    }
    Show-LogTail $LogName
    Fail "$Name did not become healthy within ${TimeoutSec}s ($Url)."
}

function Show-LogTail([string]$LogName) {
    foreach ($suffix in '.log', '.err.log') {
        $path = Join-Path $LogDir "$LogName$suffix"
        if ((Test-Path $path) -and (Get-Item $path).Length -gt 0) {
            Write-Host "---- last lines of $path ----" -ForegroundColor Yellow
            Get-Content $path -Tail 40 | ForEach-Object { Write-Host $_ }
        }
    }
}

$script:Started = @()

function Save-Pids {
    $script:Started | ConvertTo-Json | Set-Content -Path $PidFile -Encoding UTF8
}

# Starts a hidden, detached process with its own log files. Per-service
# variables are set only for the duration of the launch, so e.g. SERVER_PORT
# never leaks from one service into the next.
function Start-AppProcess([string]$Name, [string]$WorkDir, [string]$Exe, [string[]]$ExeArgs, [hashtable]$ServiceEnv) {
    $saved = @{}
    foreach ($key in $ServiceEnv.Keys) {
        $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, $ServiceEnv[$key], 'Process')
    }
    try {
        # Windows PowerShell joins ArgumentList with spaces and no quoting.
        $quoted = $ExeArgs | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }
        $proc = Start-Process -FilePath $Exe -ArgumentList $quoted -WorkingDirectory $WorkDir `
            -RedirectStandardOutput (Join-Path $LogDir "$Name.log") `
            -RedirectStandardError (Join-Path $LogDir "$Name.err.log") `
            -WindowStyle Hidden -PassThru
    } finally {
        foreach ($key in $saved.Keys) {
            [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process')
        }
    }
    $script:Started += [pscustomobject]@{ name = $Name; pid = $proc.Id }
    Save-Pids
    Write-Host "   started $Name (pid $($proc.Id))"
}

function Get-BootJar([string]$ServiceDir) {
    $jar = Get-ChildItem (Join-Path $ServiceDir 'target\*.jar') -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notlike '*-plain.jar' } |
        Select-Object -First 1
    if (-not $jar) { Fail "No jar in $ServiceDir\target - run without -SkipBuild." }
    return $jar.FullName
}

# ---------------------------------------------------------------------------
# Stage: Preflight
# ---------------------------------------------------------------------------
Write-Stage 'Preflight'

if (Test-Path $PidFile) {
    $stillRunning = @(Get-Content $PidFile -Raw | ConvertFrom-Json) |
        Where-Object { Get-Process -Id $_.pid -ErrorAction SilentlyContinue }
    if ($stillRunning) { Fail 'Services from a previous run are still running. Run windows\stop-windows.ps1 first.' }
}

foreach ($tool in 'java', 'mvn', 'node', 'npm') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Fail "$tool is not on PATH." }
}
$script:Psql = Find-Psql
if (-not $script:Psql) { Fail 'psql.exe not found. Add PostgreSQL\<version>\bin to PATH or set PSQL_BIN_DIR.' }
Write-Pass "tools found (psql: $script:Psql)"

foreach ($port in $TradeApiPort, $ExecutorPort, $GeneratorPort, $AuthPort) {
    if (Test-Tcp 'localhost' ([int]$port) 500) { Fail "Port $port is already in use on this machine." }
}

# Kafka lives on another machine: check every bootstrap entry is reachable
# before anything starts, so a firewall problem shows up here and not as a
# stream of producer timeouts in the logs.
foreach ($entry in $KafkaBootstrap.Split(',')) {
    $kafkaHost, $kafkaPort = $entry.Trim().Split(':')
    if (-not (Test-Tcp $kafkaHost ([int]$kafkaPort) 5000)) {
        Fail "Cannot reach Kafka at ${kafkaHost}:${kafkaPort}. Is windows/kafka-linux.sh running on the Linux host, and is the port open in its firewall?"
    }
}
Write-Pass "Kafka reachable at $KafkaBootstrap"

if (-not (Test-Tcp $PgHost ([int]$PgPort) 3000)) { Fail "Cannot reach Postgres at ${PgHost}:${PgPort}. Is the PostgreSQL service running?" }
$null = Invoke-Psql 'postgres' @('-c', 'SELECT 1')
Write-Pass "Postgres reachable at ${PgHost}:${PgPort} as $PgUser"

# ---------------------------------------------------------------------------
# Stage: Database
# ---------------------------------------------------------------------------
Write-Stage "Database ($PgDb)"

$exists = Invoke-Psql 'postgres' @('-c', "SELECT 1 FROM pg_database WHERE datname = '$PgDb'")
if ($exists -ne '1') {
    $null = Invoke-Psql 'postgres' @('-c', "CREATE DATABASE $PgDb")
    Write-Pass "created database $PgDb"
}

# Only the Sprint 3 base schema + seed - exactly what the Docker postgres
# mounts under docker-entrypoint-initdb.d. Deliberately NOT database/apply.sh:
# it also runs 003_auth_service.sql, whose CREATE TYPE account_status_enum
# makes trade-api's own Liquibase changeset (which creates that type) fail.
# trade-api's Liquibase adds everything after Sprint 3; auth-service creates
# its own table at boot.
$hasSchema = Invoke-Psql $PgDb @('-c', "SELECT to_regclass('public.orders') IS NOT NULL")
if ($hasSchema -ne 't') {
    $null = Invoke-Psql $PgDb @('-f', (Join-Path $RepoDir 'database\migrations\001_initial_schema.sql'))
    $null = Invoke-Psql $PgDb @('-f', (Join-Path $RepoDir 'database\seeds\001_seed_data.sql'))
    Write-Pass 'applied 001_initial_schema.sql + 001_seed_data.sql'
} else {
    Write-Pass 'schema already present - left as is'
}

# ---------------------------------------------------------------------------
# Stage: Build
# ---------------------------------------------------------------------------
$SpringServices = @('trade_api', 'trade_executor', 'trades_generator')
if ($SkipBuild) {
    Write-Stage 'Build (skipped)'
} else {
    Write-Stage 'Build'
    foreach ($svc in $SpringServices) {
        Push-Location (Join-Path $RepoDir $svc)
        try {
            # maven.test.skip: don't even compile the tests - only the jar is needed.
            & mvn -q -B '-Dmaven.test.skip=true' package
            if ($LASTEXITCODE -ne 0) { Fail "mvn package failed in $svc" }
        } finally { Pop-Location }
        Write-Pass "$svc built"
    }
    Push-Location (Join-Path $RepoDir 'auth_service')
    try {
        & npm ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { Fail 'npm ci failed in auth_service' }
        & npm run build
        if ($LASTEXITCODE -ne 0) { Fail 'npm run build failed in auth_service' }
    } finally { Pop-Location }
    Write-Pass 'auth_service built'
}

# ---------------------------------------------------------------------------
# Stage: Start
# ---------------------------------------------------------------------------
Write-Stage "Start (SPRING_PROFILES_ACTIVE=$env:SPRING_PROFILES_ACTIVE)"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
Get-ChildItem $LogDir -Filter '*.log' -ErrorAction SilentlyContinue | Remove-Item -Force

# trade-api first: its Liquibase changelog owns every schema change after
# Sprint 3, and the other three services read those columns.
Start-AppProcess 'trade-api' (Join-Path $RepoDir 'trade_api') 'java' `
    @('-jar', (Get-BootJar (Join-Path $RepoDir 'trade_api'))) `
    @{ SERVER_PORT = $TradeApiPort }
Wait-Http 'trade-api' "http://localhost:$TradeApiPort/actuator/health" '"status":"UP"' 'trade-api' 240

Start-AppProcess 'trades-generator' (Join-Path $RepoDir 'trades_generator') 'java' `
    @('-jar', (Get-BootJar (Join-Path $RepoDir 'trades_generator'))) `
    @{ SERVER_PORT = $GeneratorPort }

Start-AppProcess 'trade-executor' (Join-Path $RepoDir 'trade_executor') 'java' `
    @('-jar', (Get-BootJar (Join-Path $RepoDir 'trade_executor'))) `
    @{ SERVER_PORT = $ExecutorPort; TRADES_GENERATOR_URL = "http://localhost:$GeneratorPort" }

Start-AppProcess 'auth-service' (Join-Path $RepoDir 'auth_service') 'node' `
    @('dist/main.js') `
    @{ PORT = $AuthPort; NODE_ENV = 'development' }

Wait-Http 'trades-generator' "http://localhost:$GeneratorPort/actuator/health" '"status":"UP"' 'trades-generator'
Wait-Http 'trade-executor' "http://localhost:$ExecutorPort/actuator/health" '"status":"UP"' 'trade-executor'
Wait-Http 'auth-service' "http://localhost:$AuthPort/health" '"status":"ok"' 'auth-service' 60

# ---------------------------------------------------------------------------
# Stage: Kafka connectivity from Windows
# ---------------------------------------------------------------------------
# Actuator health has no Kafka indicator, so "UP" doesn't prove the consumer
# reached the Linux broker. Joining the group and being assigned partitions of
# 'orders' does: that needs the bootstrap connection AND the advertised
# listener to both be reachable from this machine.
Write-Stage 'Kafka connectivity (trade-executor consumer group)'
$executorLog = Join-Path $LogDir 'trade-executor.log'
$deadline = (Get-Date).AddSeconds(60)
$assigned = $false
while ((Get-Date) -lt $deadline) {
    if (Select-String -Path $executorLog -Pattern 'partitions assigned: \[.*orders' -Quiet -ErrorAction SilentlyContinue) { $assigned = $true; break }
    Start-Sleep -Seconds 2
}
if ($assigned) {
    Write-Pass 'trade-executor joined its consumer group on the Linux broker'
} else {
    Write-Host "WARN: no 'partitions assigned' line in trade-executor.log after 60s." -ForegroundColor Yellow
    Write-Host '      If the log shows connection errors to a different host than KAFKA_BOOTSTRAP_SERVERS,' -ForegroundColor Yellow
    Write-Host '      the broker is advertising the wrong address: re-run kafka-linux.sh with KAFKA_ADVERTISED_HOST set.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '== ALL SERVICES RUNNING ==' -ForegroundColor Green
Write-Host "  trade-api         http://localhost:$TradeApiPort"
Write-Host "  trade-executor    http://localhost:$ExecutorPort/actuator/health"
Write-Host "  trades-generator  http://localhost:$GeneratorPort/actuator/health"
Write-Host "  auth-service      http://localhost:$AuthPort"
Write-Host "  kafka             $KafkaBootstrap (Linux)"
Write-Host "  kafka-ui          $(Get-Setting 'KAFKA_UI_URL' '<KAFKA_UI_URL not set>')"
Write-Host "  logs              $LogDir"
Write-Host ''
Write-Host '  Verify end to end:  bash windows/test-windows.sh'
Write-Host '  Stop:               powershell -ExecutionPolicy Bypass -File windows\stop-windows.ps1'
