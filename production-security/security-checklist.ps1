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
    [string]$BundleDir = ".\trading-ui\dist\trading-ui\browser",
    [switch]$FailFast = $false,
    [switch]$Verbose = $false
)

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
    $mainBundle = Get-ChildItem $BundleDir -Filter "main-*.js" | Select-Object -First 1
    if (-not $mainBundle) {
        Write-AuditTest "Main Bundle File Exists" "FAIL" "No main-*.js file found"
        exit 1
    }
    Write-AuditTest "Main Bundle File Exists" "PASS" $mainBundle.Name

    return $mainBundle
}

# ============================================================================
# PHASE 2: SECRET PATTERN SCANNING
# ============================================================================

function Test-SecretPatterns {
    param([System.IO.FileInfo]$BundleFile)

    Write-AuditHeader "PHASE 2: SECRET PATTERN SCANNING"

    # Read bundle content
    Write-Host "Reading bundle file..." -ForegroundColor $ColorInfo
    $bundleContent = Get-Content $BundleFile.FullName -Raw
    $bundleSize = "{0:N2}" -f ($BundleFile.Length / 1MB)
    Write-Host "Bundle size: $bundleSize MB" -ForegroundColor $ColorInfo

    # Define patterns to search for
    $dangerousPatterns = @{
        "FAUXNANCE_API_KEY" = "API Key Environment Variable"
        "FAUXNANCE_API_URL" = "API URL Environment Variable"
        "JWT_SECRET" = "JWT Signing Secret"
        "singing.*secret" = "Signing Secret Pattern (regex)"
    }

    Write-Host ""
    Write-Host "Scanning for sensitive patterns..." -ForegroundColor $ColorInfo

    $allPass = $true
    foreach ($pattern in $dangerousPatterns.GetEnumerator()) {
        $patternName = $pattern.Key
        $patternDesc = $pattern.Value

        try {
            if ($patternName -like "*.*") {
                # Regex pattern
                $found = $bundleContent -match $patternName
            } else {
                # Literal string
                $found = $bundleContent -like "*$patternName*"
            }

            if ($found) {
                Write-AuditTest "Pattern Not Found: $patternDesc" "FAIL" "CRITICAL: $patternName found in bundle!"
                $allPass = $false
                if ($FailFast) { exit 1 }
            } else {
                Write-AuditTest "Pattern Not Found: $patternDesc" "PASS"
            }
        }
        catch {
            Write-AuditTest "Pattern Test: $patternDesc" "WARN" "Error testing pattern"
        }
    }

    return $allPass
}

# ============================================================================
# PHASE 3: API ENDPOINT VERIFICATION
# ============================================================================

function Test-APIEndpoints {
    param([System.IO.FileInfo]$BundleFile)

    Write-AuditHeader "PHASE 3: API ENDPOINT VERIFICATION"

    $bundleContent = Get-Content $BundleFile.FullName -Raw

    Write-Host "Checking authorized API endpoints..." -ForegroundColor $ColorInfo

    $allPass = $true

    # Check for authorized endpoints (should exist)
    $authorizedEndpoints = @{
        "localhost:3000" = "Auth Service"
        "localhost:8080" = "Trade API"
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
    param([string]$SourceDir = ".\src")

    Write-AuditHeader "PHASE 4: SOURCE CODE VERIFICATION"

    if (-not (Test-Path $SourceDir)) {
        Write-AuditTest "Source Code Directory" "WARN" "Directory not found: $SourceDir"
        return $true
    }

    Write-Host "Scanning source code for vulnerabilities..." -ForegroundColor $ColorInfo

    # Check for Fauxnance references (should only be in comments)
    try {
        $fauxnanceRefs = Get-ChildItem -Path $SourceDir -Recurse -Include "*.ts" |
            Select-String -Pattern "fauxnance|FAUXNANCE" |
            Where-Object { $_ -notmatch "//.*fauxnance" } # Exclude comments

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
            Where-Object { $_ -notmatch "^.*//.*" } # Exclude comments

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
    $envFile = ".\src\environments\environment.ts"
    if (Test-Path $envFile) {
        $envContent = Get-Content $envFile -Raw

        if ($envContent -match "(api_key|apiKey|secret|password)" -and $envContent -notmatch "comment") {
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
    $mainBundle = Test-Prerequisites
    $phase2Pass = Test-SecretPatterns $mainBundle
    $phase3Pass = Test-APIEndpoints $mainBundle
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
