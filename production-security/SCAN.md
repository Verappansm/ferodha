# Running Security Scan

**Steps to run security scan on the production bundle**

---

## Prerequisites

-  Production bundle built (see [BUILD.md](BUILD.md))
-  You're in project root directory
-  PowerShell 5.1+ available

---

## Step 1: Verify You're in Project Root

```powershell
# You should be in the capstone2 project root, NOT in trading-ui/
# Expected path: C:\...\capstone-SE4-team2

# If you're still in trading-ui, return to root:
cd ..
```

---

## Step 2: Run Security Checklist

Execute the automated security scanner:

```powershell
PowerShell -ExecutionPolicy Bypass -File production-security/security-checklist.ps1
```

### Runtime

The scan takes approximately 30-60 seconds.

---

## Step 3: Monitor Scan Progress

The script will output 6 phases:

```
PHASE 1: PREREQUISITES           Checking bundle files
PHASE 2: SECRET PATTERNS         Scanning for secrets
PHASE 3: API ENDPOINTS           Verifying endpoints
PHASE 4: SOURCE CODE             Checking code patterns
PHASE 5: BUILD CONFIGURATION     Verifying build config
COMPLIANCE SUMMARY               Final results
```

---

## Step 4: Review Results

The final result will be one of three:

###  PASSED - Safe to Deploy

```
RESULT:  PASSED
Bundle is secure and ready for deployment.
```

**What this means:**
- All security tests passed
- No secrets found in bundle
- No unauthorized API calls
- Safe to deploy immediately

**Action:** Deploy to production

---

###  PASS WITH WARNINGS - Review Required

```
RESULT:   PASS WITH WARNINGS
Review warnings before deployment.
```

**What this means:**
- Most tests passed
- Some non-critical warnings detected
- Likely false positives or library code

**Action:**
1. Review warning messages
2. Determine if acceptable
3. If OK: Deploy to production
4. If not OK: Fix issue, rebuild, re-scan

**Common warnings:**
- "Found X occurrences of https://"  Usually library code (OK)
- "Pattern test partial match"  Usually in comments (OK)

---

###  FAILED - DO NOT DEPLOY

```
RESULT:  FAILED
Security issues detected. DO NOT DEPLOY.
```

**What this means:**
- Critical security issue found
- Secrets exposed in bundle
- Unauthorized endpoints detected
- Code vulnerability detected

**Action:**
1. **DO NOT DEPLOY**
2. Review all `[FAIL]` items
3. Identify the security issue
4. Fix in source code
5. Rebuild bundle (see [BUILD.md](BUILD.md))
6. Re-run scan
7. Repeat until it passes

---

## Common Issues & Fixes

### Issue: "Bundle Directory Exists - FAIL"

**Problem:** Bundle not found at expected location

**Fix:**
1. Go back to [BUILD.md](BUILD.md)
2. Run `npm run build` in trading-ui/
3. Return to project root
4. Re-run scan

```powershell
cd trading-ui && npm run build && cd .. && `
PowerShell -ExecutionPolicy Bypass -File production-security/security-checklist.ps1
```

---

### Issue: "FAUXNANCE_API_KEY found - FAIL"

**Problem:** API key exposed in bundle (critical security issue)

**Fix:**
1. Search source code: `grep -r "FAUXNANCE_API_KEY" trading-ui/src/`
2. Remove any hardcoded key from code
3. Never commit API keys to code
4. Rebuild: `cd trading-ui && npm run build && cd ..`
5. Re-scan: `PowerShell -ExecutionPolicy Bypass -File production-security/security-checklist.ps1`

---

### Issue: "Script won't execute"

**Problem:** PowerShell execution policy blocks script

**Fix:**
```powershell
# The command already includes -ExecutionPolicy Bypass
# If still failing, try:
PowerShell -ExecutionPolicy Bypass -NoProfile `
  -File production-security/security-checklist.ps1
```

---

### Issue: "Found external HTTPS endpoints - WARNING"

**Problem:** External endpoints detected in bundle

**Fix:**
1. Check the warning - is it in library code? (Usually yes - OK to ignore)
2. If it's your code: Remove external API calls from frontend
3. Use backend services instead

---

## Saving Scan Results

To save the scan report to a file:

```powershell
# Save with timestamp
PowerShell -ExecutionPolicy Bypass -File production-security/security-checklist.ps1 | `
  Tee-Object -FilePath "audit-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
```

This creates a timestamped audit file for records.

---

## Scan Options

### Option A: Standard Scan (Recommended)

```powershell
PowerShell -ExecutionPolicy Bypass -File production-security/security-checklist.ps1
```

### Option B: Custom Bundle Directory

If your bundle is in a different location:

```powershell
PowerShell -ExecutionPolicy Bypass -File production-security/security-checklist.ps1 `
  -BundleDir "C:\custom\path\to\bundle"
```

### Option C: Fail-Fast Mode (Stop on First Error)

```powershell
PowerShell -ExecutionPolicy Bypass -File production-security/security-checklist.ps1 `
  -FailFast
```

---

## Understanding Test Phases

### Phase 1: Prerequisites
- Checks bundle directory exists
- Checks main bundle file exists
- Verifies file is readable

### Phase 2: Secret Patterns (CRITICAL)
Searches for sensitive data:
- `FAUXNANCE_API_KEY`
- `JWT_SECRET`
- `API_URL` patterns
- Signing secrets

**Result must be PASS - Any fail means secrets exposed**

### Phase 3: API Endpoints (CRITICAL)
Verifies authorized endpoints:
-  localhost:3000 (Auth Service)
-  localhost:8080 (Trade API)
-  No external API calls

**Result must be PASS - Any fail means calling external APIs**

### Phase 4: Source Code
Checks source code patterns:
- Fauxnance references
- Hardcoded secrets
- Direct API calls

### Phase 5: Build Configuration
Verifies build security:
- Source maps not deployed
- HTML secure
- No debug code

### Phase 6: Compliance Summary
Final verdict:
- Count of passed tests
- Count of failed tests
- Count of warnings
- Overall result

---

## What Each Test Checks

| Test | Checks | Pass Means |
|------|--------|-----------|
| Bundle exists | Directory found |  Build created |
| Main file exists | JS bundle found |  Build completed |
| API key not found | No `FAUXNANCE_API_KEY` |  Key not exposed |
| JWT secret not found | No `JWT_SECRET` |  Secret not exposed |
| Auth endpoint | Only localhost:3000 |  Authorized only |
| Trade endpoint | Only localhost:8080 |  Authorized only |
| No external APIs | No external hosts |  No unauthorized calls |
| Source maps | `.map` files absent |  Code protected |
| HTML secure | No hardcoded secrets |  HTML safe |

---

## Next Steps

### If  PASSED:
1. Bundle is secure
2. Ready to deploy
3. Save audit report if needed
4. Deploy to production

### If  PASS WITH WARNINGS:
1. Review warning details
2. Determine if acceptable
3. If OK: Deploy
4. If not OK: Fix and re-scan

### If  FAILED:
1. DO NOT DEPLOY
2. Fix the security issue
3. Rebuild bundle
4. Re-run scan
5. Verify it passes before deploying

---

## Pre-Deployment Checklist

Before deploying after scan passes:

- [ ] Scan result:  PASSED
- [ ] Audit report saved (optional)
- [ ] Source maps verified NOT in dist/
- [ ] Environment variables set for production
- [ ] API endpoints verified correct
- [ ] Team notified of deployment
- [ ] Monitoring configured

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `PowerShell -ExecutionPolicy Bypass -File production-security/security-checklist.ps1` | Run scan |
| `cd trading-ui && npm run build && cd ..` | Rebuild and return |
| `PowerShell ... \| Tee-Object -FilePath audit.txt` | Save report |

---

**Status:  Ready to Scan**
**Previous:** [BUILD.md](BUILD.md)
**Next:** Deploy (if passed)
