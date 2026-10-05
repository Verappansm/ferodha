<#
.SYNOPSIS
    Automated Security Checklist for Production Bundle Scanning

.DESCRIPTION
    Comprehensive security verification for trading-ui production builds.
    Scans for exposed secrets, API keys, and unauthorized endpoints.

.USAGE
    PowerShell -ExecutionPolicy Bypass -File security-checklist.ps1

.NOTES
    Date Created: 2026-10-02
    Purpose: Pre-deployment security verification
    Recommended: Run before every production release
#>

param(
    # Every file of the production build is scanned, not only main-*.js:
    # a secret in a lazy chunk, the HTML, a licence file or a source map is
    # published just the same.
    [string]$BundleDir = "",
    [switch]$FailFast = $false,
    [switch]$Verbose = $false
)

# Paths are resolved from this script's location, so the scan works from any
# working directory.
$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $BundleDir) { $BundleDir = Join-Path $RepoRoot "trading-ui\dist\trading-ui" }
$SourceRoot = Join-Path $RepoRoot "trading-ui\src"

# Configuration
$ErrorActionPreference = "Continue"
$Script:TestCount = 0
$Script:PassCount = 0
$Script:FailCount = 0
$Script:WarningCount = 0

# Color output
$ColorPass = "Green"
$ColorFail = "Red"
$ColorWarn = "Yellow"
$ColorInfo = "Cyan"

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

function Write-AuditHeader {
    param([string]$Text)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor $ColorInfo
    Write-Host $Text -ForegroundColor $ColorInfo
    Write-Host "========================================" -ForegroundColor $ColorInfo
}

function Write-AuditTest {
    param(
        [string]$TestName,
        [string]$Status,
        [string]$Details = ""
    )

    $Script:TestCount++
    $Color = if ($Status -eq "PASS") { $ColorPass }
             elseif ($Status -eq "FAIL") { $ColorFail }
             else { $ColorWarn }

    if ($Status -eq "PASS") { $Script:PassCount++ }
    elseif ($Status -eq "FAIL") { $Script:FailCount++ }
    elseif ($Status -eq "WARN") { $Script:WarningCount++ }

    $StatusStr = "[{0}]" -f $Status
    Write-Host $StatusStr -ForegroundColor $Color -NoNewline
    Write-Host " $TestName"
    if ($Details) { Write-Host "    $Details" -ForegroundColor $ColorInfo }
}

function Invoke-BundleTest {
    param(
        [string]$TestName,
        [scriptblock]$TestBlock,
        [bool]$ShouldFail = $false
    )

    try {
        $result = & $TestBlock

        if ($ShouldFail) {
            if ($result) {
                Write-AuditTest $TestName "FAIL" "Found when should not exist"
                return $false
            } else {
                Write-AuditTest $TestName "PASS"
                return $true
            }
        } else {
            if ($result) {
                Write-AuditTest $TestName "PASS"
                return $true
            } else {
                Write-AuditTest $TestName "FAIL"
                return $false
            }
        }
    }
    catch {
        Write-AuditTest $TestName "FAIL" "Error: $_"
        return $false
    }
}

# ============================================================================
# PHASE 1: PREREQUISITES
# ============================================================================

function Test-Prerequisites {
    Write-AuditHeader "PHASE 1: PREREQUISITES"

    Write-Host "Checking prerequisites..." -ForegroundColor $ColorInfo

    # Check bundle directory exists
    if (-not (Test-Path $BundleDir)) {
        Write-AuditTest "Bundle Directory Exists" "FAIL" "Directory not found: $BundleDir"
        Write-Host ""
        Write-Host "Please run: npm run build" -ForegroundColor $ColorWarn
        exit 1
    }
    Write-AuditTest "Bundle Directory Exists" "PASS" "$BundleDir"

    # Check main bundle file exists
    $mainBundle = Get-ChildItem $BundleDir -Recurse -Filter "main-*.js" | Select-Object -First 1
    if (-not $mainBundle) {
        Write-AuditTest "Main Bundle File Exists" "FAIL" "No main-*.js file found"
        exit 1
    }
    Write-AuditTest "Main Bundle File Exists" "PASS" $mainBundle.Name

    $files = @(Get-ChildItem $BundleDir -Recurse -File)
    Write-AuditTest "Build Files Collected" "PASS" "$($files.Count) files under $BundleDir"
    return $files
}

# All build output as one searchable text, each file headed by its name.
function Get-BundleText {
    param([System.IO.FileInfo[]]$Files)
    ($Files | ForEach-Object { "`n=== $($_.Name) ===`n" + (Get-Content $_.FullName -Raw) }) -join ""
}

# The value of KEY=value in an env file, or "" when absent or a placeholder.
function Get-EnvValue {
    param([string]$File, [string]$Key)
    if (-not (Test-Path $File)) { return "" }
    $line = Get-Content $File | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
    if (-not $line) { return "" }
    $value = ($line -replace "^\s*$Key\s*=", "").Trim().Trim('"').Trim("'")
    if ($value.Length -lt 8 -or $value -match "^(replace|change|your-|<)") { return "" }
    return $value
}

# ============================================================================
# PHASE 2: SECRET PATTERN SCANNING
# ============================================================================

function Test-SecretPatterns {
    param([System.IO.FileInfo[]]$Files)

    Write-AuditHeader "PHASE 2: SECRET PATTERN SCANNING"

    $bundleContent = Get-BundleText $Files
    $bundleSize = "{0:N2}" -f (($Files | Measure-Object Length -Sum).Sum / 1MB)
    Write-Host "Build output size: $bundleSize MB" -ForegroundColor $ColorInfo

    # The patterns the Sprint 9 brief names, matched case-insensitively.
    # Any hit fails the scan.
    $dangerousPatterns = [ordered]@{
        'x-api-key'                                       = "Market-data key header name"
        'api_key'                                         = "API key name (api_key)"
        'api-key'                                         = "API key name (api-key)"
        'fauxnance'                                       = "Fauxnance name or host"
        'execute-api\.[a-z0-9-]+\.amazonaws\.com'         = "Market-data host (execute-api.<region>.amazonaws.com)"
        'jwt_secret'                                      = "JWT signing secret name"
        'signing.?secret'                                 = "Signing secret name"
        'eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}' = "A three-part JWT written into source"
        '(secret|token|password|api.?key)["'']?\s*[:=]\s*["''][A-Za-z0-9+/=_.-]{24,}["'']' = "A secret assigned a long literal"
    }

    Write-Host ""
    Write-Host "Scanning for sensitive patterns..." -ForegroundColor $ColorInfo

    $allPass = $true
    foreach ($pattern in $dangerousPatterns.GetEnumerator()) {
        $hits = [regex]::Matches($bundleContent, $pattern.Key, "IgnoreCase")
        if ($hits.Count -gt 0) {
            Write-AuditTest "Pattern Not Found: $($pattern.Value)" "FAIL" "CRITICAL: $($hits.Count) match(es) in the build"
            $allPass = $false
            if ($FailFast) { exit 1 }
        } else {
            Write-AuditTest "Pattern Not Found: $($pattern.Value)" "PASS"
        }
    }

    # The literal values of the team's own key and signing secret, from the
    # local env files. Catches a value pasted in under a name none of the
    # patterns above would match. The values are never printed.
    Write-Host ""
    Write-Host "Scanning for the literal values of our own secrets..." -ForegroundColor $ColorInfo

    $envFiles = @(
        (Join-Path $RepoRoot ".env"),
        (Join-Path $RepoRoot "windows\.env.windows")
    )
    foreach ($key in @("FAUXNANCE_API_KEY", "JWT_SECRET")) {
        $values = @($envFiles | ForEach-Object { Get-EnvValue $_ $key } | Where-Object { $_ } | Select-Object -Unique)
        if ($values.Count -eq 0) {
            Write-AuditTest "Literal Value Not Found: $key" "WARN" "No value set in .env or windows\.env.windows, so this check could not run"
            continue
        }
        $found = $values | Where-Object { $bundleContent.IndexOf($_, [StringComparison]::OrdinalIgnoreCase) -ge 0 }
        if ($found) {
            Write-AuditTest "Literal Value Not Found: $key" "FAIL" "CRITICAL: the value of $key is in the build. Revoke it; do not just delete the line."
            $allPass = $false
            if ($FailFast) { exit 1 }
        } else {
            Write-AuditTest "Literal Value Not Found: $key" "PASS"
        }
    }

    return $allPass
}

# ============================================================================
# PHASE 3: API ENDPOINT VERIFICATION
# ============================================================================

function Test-APIEndpoints {
    param([System.IO.FileInfo[]]$Files)

    Write-AuditHeader "PHASE 3: API ENDPOINT VERIFICATION"

    $bundleContent = Get-BundleText $Files

    Write-Host "Checking authorized API endpoints..." -ForegroundColor $ColorInfo

    $allPass = $true

    # The platform's own APIs, read from environment.ts rather than hard-coded,
    # so the check follows whichever ports the build was made for.
    $authorizedEndpoints = @{}
    $envTs = Join-Path $SourceRoot "environments\environment.ts"
    if (Test-Path $envTs) {
        $envTsContent = Get-Content $envTs -Raw
        foreach ($name in @("authApiUrl", "tradeApiUrl")) {
            $m = [regex]::Match($envTsContent, $name + '\s*:\s*[''"]https?://([^''"/]+)')
            if ($m.Success) { $authorizedEndpoints[$m.Groups[1].Value] = $name }
        }
    }

    foreach ($endpoint in $authorizedEndpoints.GetEnumerator()) {
        $endpointAddr = $endpoint.Key
        $endpointName = $endpoint.Value

        if ($bundleContent -like "*$endpointAddr*") {
            Write-AuditTest "Authorized Endpoint: $endpointName" "PASS" $endpointAddr
        } else {
            Write-AuditTest "Authorized Endpoint: $endpointName" "WARN" "Not found in bundle"
        }
    }

    Write-Host ""
    Write-Host "Checking for unauthorized external endpoints..." -ForegroundColor $ColorInfo

    # Check for unauthorized endpoints (should NOT exist)
    $unauthorizedPatterns = @{
        "https://" = "External HTTPS endpoints"
        "https://api." = "API subdomains"
        ".fauxnance." = "Fauxnance domain"
        "amazonaws.com" = "AWS endpoints"
        "azure.microsoft.com" = "Azure endpoints"
        "market-data" = "Market data service"
        "pricing-api" = "External pricing service"
    }

    foreach ($pattern in $unauthorizedPatterns.GetEnumerator()) {
        $patternStr = $pattern.Key
        $patternDesc = $pattern.Value

        if ($bundleContent -like "*$patternStr*") {
            # Check if it's in a comment or data (less critical)
            $count = ([regex]::Matches($bundleContent, [regex]::Escape($patternStr))).Count
            Write-AuditTest "No Unauthorized: $patternDesc" "WARN" "Found $count occurrences (verify not critical)"
        } else {
            Write-AuditTest "No Unauthorized: $patternDesc" "PASS"
        }
    }

    return $allPass
}

# ============================================================================
# PHASE 4: SOURCE CODE VERIFICATION
# ============================================================================

function Test-SourceCode {
    param([string]$SourceDir = $SourceRoot)

    Write-AuditHeader "PHASE 4: SOURCE CODE VERIFICATION"

    if (-not (Test-Path $SourceDir)) {
        Write-AuditTest "Source Code Directory" "WARN" "Directory not found: $SourceDir"
        return $true
    }

    Write-Host "Scanning source code for vulnerabilities..." -ForegroundColor $ColorInfo

    # Check for Fauxnance references (should only be in comments)
    try {
        $fauxnanceRefs = Get-ChildItem -Path $SourceDir -Recurse -Include "*.ts" |
            Select-String -Pattern "fauxnance" |
            Where-Object { $_.Line -notmatch '^\s*(//|/\*|\*)' } # Exclude comment lines

        if ($fauxnanceRefs) {
            Write-AuditTest "No Direct Fauxnance Calls" "FAIL" "Found non-comment references"
            $fauxnanceRefs | ForEach-Object { Write-Host "  $_" -ForegroundColor $ColorWarn }
        } else {
            Write-AuditTest "No Direct Fauxnance Calls" "PASS"
        }
    }
    catch {
        Write-AuditTest "Source Code Scan" "WARN" "Could not scan source files"
    }

    # Check for hardcoded secrets
    Write-Host ""
    Write-Host "Checking for hardcoded secrets in source..." -ForegroundColor $ColorInfo

    try {
        $secretRefs = Get-ChildItem -Path $SourceDir -Recurse -Include "*.ts" |
            Select-String -Pattern "api_key|apiKey|secret|JWT" |
            Where-Object { $_.Line -notmatch '^\s*(//|/\*|\*)' } # Exclude comment lines

        if ($secretRefs) {
            Write-AuditTest "No Hardcoded Secrets" "WARN" "Found potential secrets (review manually)"
            $secretRefs | Select-Object -First 5 | ForEach-Object { Write-Host "  $_" -ForegroundColor $ColorWarn }
        } else {
            Write-AuditTest "No Hardcoded Secrets" "PASS"
        }
    }
    catch {
        Write-AuditTest "Hardcoded Secrets Scan" "WARN" "Could not complete scan"
    }
}

# ============================================================================
# PHASE 5: BUILD CONFIGURATION
# ============================================================================

function Test-BuildConfiguration {
    Write-AuditHeader "PHASE 5: BUILD CONFIGURATION"

    Write-Host "Checking build security configuration..." -ForegroundColor $ColorInfo

    # Check for source maps in dist
    $sourceMaps = Get-ChildItem $BundleDir -Recurse -Include "*.js.map" -ErrorAction SilentlyContinue

    if ($sourceMaps) {
        Write-AuditTest "Source Maps Not Deployed" "FAIL" "Found .map files (security risk!)"
        $sourceMaps | ForEach-Object { Write-Host "  $_" -ForegroundColor $ColorWarn }
    } else {
        Write-AuditTest "Source Maps Not Deployed" "PASS"
    }

    # Check index.html for secrets
    $indexHtml = Get-ChildItem $BundleDir -Filter "index.html" | Select-Object -First 1
    if ($indexHtml) {
        $indexContent = Get-Content $indexHtml.FullName -Raw

        if ($indexContent -match "(secret|apikey|api.key)" -and $indexContent -notmatch "<!--.*secret.*-->") {
            Write-AuditTest "No Secrets in HTML" "WARN" "Potential secrets in index.html"
        } else {
            Write-AuditTest "No Secrets in HTML" "PASS"
        }
    }

    # Check environment configuration
    $envFile = Join-Path $SourceRoot "environments\environment.ts"
    if (Test-Path $envFile) {
        # Code only: block and line comments removed before matching.
        $envContent = (Get-Content $envFile -Raw) -replace '(?s)/\*.*?\*/', '' -replace '//[^\n]*', ''

        if ($envContent -match "(api_key|apiKey|secret|password)") {
            Write-AuditTest "No Secrets in Environment" "FAIL" "Potential secrets in environment.ts"
        } else {
            Write-AuditTest "No Secrets in Environment" "PASS"
        }
    }
}

# ============================================================================
# PHASE 6: COMPLIANCE SUMMARY
# ============================================================================

function Test-ComplianceSummary {
    Write-AuditHeader "COMPLIANCE SUMMARY"

    Write-Host ""
    Write-Host "Test Results:" -ForegroundColor $ColorInfo
    Write-Host "  Total Tests:    $Script:TestCount" -ForegroundColor $ColorInfo
    Write-Host "  Passed:         $Script:PassCount" -ForegroundColor $ColorPass
    Write-Host "  Failed:         $Script:FailCount" -ForegroundColor $ColorFail
    Write-Host "  Warnings:       $Script:WarningCount" -ForegroundColor $ColorWarn

    Write-Host ""

    # Determine overall status
    if ($Script:FailCount -gt 0) {
        Write-Host "RESULT: ❌ FAILED" -ForegroundColor $ColorFail
        Write-Host "Security issues detected. DO NOT DEPLOY." -ForegroundColor $ColorFail
        return $false
    }
    elseif ($Script:WarningCount -gt 0) {
        Write-Host "RESULT: ⚠️  PASS WITH WARNINGS" -ForegroundColor $ColorWarn
        Write-Host "Review warnings before deployment." -ForegroundColor $ColorWarn
        return $true
    }
    else {
        Write-Host "RESULT: ✅ PASSED" -ForegroundColor $ColorPass
        Write-Host "Bundle is secure and ready for deployment." -ForegroundColor $ColorPass
        return $true
    }
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

function Main {
    Write-Host ""
    Write-Host "[SECURITY CHECK] Trading-UI Production Security Checklist" -ForegroundColor $ColorInfo
    Write-Host "Date: $(Get-Date -Format `"yyyy-MM-dd HH:mm:ss`")" -ForegroundColor $ColorInfo

    # Run all tests
    $buildFiles = Test-Prerequisites
    $phase2Pass = Test-SecretPatterns $buildFiles
    $phase3Pass = Test-APIEndpoints $buildFiles
    Test-SourceCode
    Test-BuildConfiguration
    $overallPass = Test-ComplianceSummary

    Write-Host ""

    if ($overallPass -and $Script:FailCount -eq 0) {
        Write-Host "✅ SECURITY AUDIT PASSED - Ready for deployment" -ForegroundColor $ColorPass
        exit 0
    }
    else {
        Write-Host "❌ SECURITY AUDIT FAILED - Review issues before deployment" -ForegroundColor $ColorFail
        exit 1
    }
}

# Execute main
Main
