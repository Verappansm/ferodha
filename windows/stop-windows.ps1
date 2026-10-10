<#
.SYNOPSIS
  Stops everything windows/start-windows.ps1 runs on this machine: every
  service it started (with their child processes), anything java or node
  still listening on the platform's ports, and the local PostgreSQL service.
  Kafka on the Linux host is left alone - stop it there with
  ./windows/kafka-linux.sh down

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File windows\stop-windows.ps1
  powershell -ExecutionPolicy Bypass -File windows\stop-windows.ps1 -KeepPostgres
#>
param(
    [switch]$KeepPostgres
)

$ErrorActionPreference = 'Stop'

$PidFile = Join-Path $PSScriptRoot '.run\pids.json'
$EnvFile = Join-Path $PSScriptRoot '.env.windows'

# Ports and the Postgres host from windows/.env.windows, with the same
# defaults start-windows.ps1 uses.
$Settings = @{}
if (Test-Path $EnvFile) {
    foreach ($line in Get-Content $EnvFile) {
        $trimmed = $line.Trim()
        if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
        $idx = $trimmed.IndexOf('=')
        if ($idx -lt 1) { continue }
        $Settings[$trimmed.Substring(0, $idx).Trim()] = $trimmed.Substring($idx + 1).Trim().Trim('"')
    }
}
function Get-Setting([string]$Name, [string]$Default) {
    if ($Settings.ContainsKey($Name) -and $Settings[$Name] -ne '') { return $Settings[$Name] }
    return $Default
}

# Stops a process and every process it started (ng serve's helpers, for one).
# Windows PowerShell 5.1 turns a native command's stderr into an error
# record, which 'Stop' would make fatal, so taskkill runs under 'Continue'.
function Stop-Tree([int]$ProcessId, [string]$Label) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $null = & taskkill.exe /PID $ProcessId /T /F 2>&1
        if ($LASTEXITCODE -ne 0) { Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue }
    } finally {
        $ErrorActionPreference = $previous
    }
    Write-Host "stopped $Label (pid $ProcessId)"
}

# 1. Everything the start script recorded. Only java/node: a PID left over
#    from an earlier run may since have been reused by an unrelated process.
if (Test-Path $PidFile) {
    # Assigned first: in Windows PowerShell 5.1, @(... | ConvertFrom-Json)
    # wraps the whole array as one element instead of listing the services.
    $recorded = Get-Content $PidFile -Raw | ConvertFrom-Json
    foreach ($entry in @($recorded)) {
        $proc = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
        if ($proc -and $proc.ProcessName -in 'java', 'node') {
            Stop-Tree $entry.pid $entry.name
        } else {
            Write-Host "$($entry.name) (pid $($entry.pid)) was not running"
        }
    }
    Remove-Item $PidFile -Force
} else {
    Write-Host 'No windows\.run\pids.json - checking the ports anyway.'
}

# 2. Anything java or node still listening on a platform port: a service
#    from a run that failed part-way, or a UI started by hand.
$Ports = @(
    (Get-Setting 'TRADE_API_PORT' '8081'),
    (Get-Setting 'TRADE_EXECUTOR_PORT' '8082'),
    (Get-Setting 'AUTH_SERVICE_PORT' '3000'),
    '4200',
    '4300'
) | ForEach-Object { [int]$_ }
$listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in $Ports } |
    Select-Object -Property LocalPort, OwningProcess -Unique
foreach ($listener in $listeners) {
    $proc = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -in 'java', 'node') {
        Stop-Tree $proc.Id "$($proc.ProcessName) on port $($listener.LocalPort)"
    } elseif ($proc) {
        Write-Host "port $($listener.LocalPort) is held by $($proc.ProcessName) (pid $($proc.Id)) - not ours, left running" -ForegroundColor Yellow
    }
}

# 3. The local PostgreSQL service (only when Postgres runs on this machine).
$PgHost = Get-Setting 'POSTGRES_HOST' 'localhost'
if ($KeepPostgres) {
    Write-Host 'PostgreSQL left running (-KeepPostgres).'
} elseif ($PgHost -notin 'localhost', '127.0.0.1', '::1') {
    Write-Host "PostgreSQL is on $PgHost, not this machine - left alone."
} else {
    $services = @(Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Running' })
    if ($services.Count -eq 0) {
        Write-Host 'PostgreSQL service is not running.'
    }
    foreach ($service in $services) {
        try {
            Stop-Service -Name $service.Name -Force -ErrorAction Stop
            Write-Host "stopped PostgreSQL service $($service.Name)"
        } catch {
            Write-Host "Could not stop $($service.Name): run this window as Administrator, or stop it in services.msc." -ForegroundColor Yellow
        }
    }
}

Write-Host ''
Write-Host 'Kafka on the Linux host is still running: stop it there with  bash windows/kafka-linux.sh down'
