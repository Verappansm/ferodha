# Production Security Scanning Suite

**Automated security verification for trading-ui production deployments**

---

## Overview

This folder contains tools and procedures to ensure trading-ui production bundles are secure before deployment.

---

## Quick Start (3 minutes)

### 1. Build Production Bundle

Follow steps in [BUILD.md](BUILD.md):

```powershell
cd trading-ui
npm run build
cd ..
```

### 2. Run Security Scan

Follow steps in [SCAN.md](SCAN.md):

```powershell
PowerShell -ExecutionPolicy Bypass -File production-security/security-checklist.ps1
```

### 3. Review Results

-  **PASSED**  Deploy immediately
-  **WARNINGS**  Review, then deploy if OK
-  **FAILED**  Fix issue, rebuild, re-scan

---

## Files in This Folder

###  BUILD.md
**How to build production bundle**

- Step-by-step build instructions
- Prerequisites and verification
- Build options (quick vs. clean)
- Troubleshooting build issues

**Read this first** when building the bundle.

---

###  SCAN.md
**How to run security scan**

- Step-by-step scan instructions
- Understanding scan results
- Common issues and fixes
- Scan options and variants

**Read this** after building to scan for security issues.

---

###  security-checklist.ps1
**Automated security scanner script**

The PowerShell script that:
- Scans for API keys and secrets
- Verifies API endpoints
- Checks build configuration
- Generates compliance report
- Produces pass/fail/warning verdict

**Don't edit** - use as-is for security scanning.

---

###  security-patterns.json
**Configuration file with security patterns**

Documents:
- Dangerous patterns to search for
- Authorized endpoints
- Compliance requirements
- Test descriptions

**Reference only** - used by the scanner.

---

## Workflow

```
START

Read BUILD.md

Run: npm run build

Read SCAN.md

Run: PowerShell -File security-checklist.ps1

Review Results

 PASSED?  DEPLOY
 FAILED?  FIX & REBUILD & RESCAN
```

---

## Common Tasks

### Build and Scan in One Command

```powershell
cd trading-ui && npm run build && cd .. && `
PowerShell -ExecutionPolicy Bypass -File production-security/security-checklist.ps1
```

### Save Audit Report

```powershell
PowerShell -ExecutionPolicy Bypass -File production-security/security-checklist.ps1 | `
  Tee-Object -FilePath "audit-$(Get-Date -Format 'yyyyMMdd-HHmm').txt"
```

### Rebuild Without Cleaning

```powershell
cd trading-ui && npm run build && cd ..
```

### Full Clean Rebuild

```powershell
cd trading-ui && rm -r dist node_modules && npm install && npm run build && cd ..
```

---

## Security Checks

The scanner verifies:

| Check | Purpose |
|-------|---------|
|  No API Keys | Frontend doesn't contain FAUXNANCE_API_KEY |
|  No Secrets | JWT_SECRET and other secrets not exposed |
|  API Isolation | Frontend only calls localhost:3000, 8080 |
|  No External APIs | Market data API not called from frontend |
|  No Source Maps | `.map` files not deployed |
|  Build Security | Configuration is production-safe |

---

## Test Results

###  PASSED

All tests passed. Bundle is secure. Ready to deploy.

###  PASS WITH WARNINGS

Some non-critical warnings. Review and determine if acceptable before deploying.

###  FAILED

Security issue found. **DO NOT DEPLOY.** Fix the issue, rebuild, and re-scan.

---

## Troubleshooting

**For build issues:** See [BUILD.md](BUILD.md#troubleshooting)

**For scan issues:** See [SCAN.md](SCAN.md#common-issues--fixes)

---

## CI/CD Integration

To integrate into your CI/CD pipeline, see [SCAN.md](SCAN.md#saving-scan-results) for examples.

---

## Key Principles

-  **Automated** - No manual security checks needed
-  **Fast** - Scan completes in ~1 minute
-  **Reliable** - Consistent results every time
-  **Secure** - Prevents secrets from reaching production
-  **Simple** - Just run the script and check results

---

## Status

 **Production Ready** - Use this suite for every release

---

## Next Steps

1. **First Time?** Start with [BUILD.md](BUILD.md)
2. **Building?** Follow [BUILD.md](BUILD.md) steps
3. **Scanning?** Follow [SCAN.md](SCAN.md) steps
4. **Issues?** Check troubleshooting in respective files

---

**Last Updated:** 2026-10-02
**Version:** 2.0
**Status:**  Ready for Production Use
