# Building Production Bundle

**Steps to build the trading-ui production bundle for security scanning**

---

## Prerequisites

Verify you have the required tools:

```powershell
# Check Node.js version (should be v20+, v22+, or v24+)
node --version

# Check npm version (should be v11+)
npm --version
```

If not installed, install Node.js and npm first.

---

## Step 1: Navigate to Project Root

```powershell
cd "C:\Users\Administrator\Documents\GitHub\capstone 2\chennai-capstone-SE4-team2"
```

Or use your project root directory path.

---

## Step 2: Navigate to trading-ui Directory

```powershell
cd trading-ui
```

---

## Step 3: Build Production Bundle

```powershell
npm run build
```

### Expected Output

```
Initial chunk files | Names         |  Raw size | Estimated transfer size
main-QZW2DGUZ.js    | main          | 341.45 kB |                87.31 kB
styles-5INURTSO.css | styles        |   0 bytes |                 0 bytes

                    | Initial total | 341.45 kB |                87.31 kB

Application bundle generation complete. [5.574 seconds]
Output location: C:\...\trading-ui\dist\trading-ui
```

### Build Duration

- Typical: 10-15 seconds
- First time: 20-30 seconds

---

## Step 4: Verify Bundle Created

Check that the bundle files exist:

```powershell
# List bundle contents
ls dist/trading-ui/browser/

# Should show:
# - main-*.js          (minified JavaScript)
# - styles-*.css       (minified CSS)
# - index.html         (HTML entry point)
# - 3rdpartylicenses.txt (license info)
```

If you see these files, the build succeeded

---

## Step 5: Return to Project Root

```powershell
cd ..
```

You're now ready for security scanning.

---

## Build Options

### Option A: Clean Rebuild (Start Fresh)

If you want to clear old builds:

```powershell
# In trading-ui directory
rm -r dist node_modules    # Delete previous build
npm install                # Reinstall dependencies
npm run build              # Build production bundle
```

### Option B: Quick Rebuild (Incremental)

For faster rebuilds after code changes:

```powershell
# In trading-ui directory
npm run build              # Builds only changed files
```

---

## Troubleshooting

### Error: "npm: command not found"

**Solution:** Install Node.js and npm
- Download from: https://nodejs.org/
- Choose LTS version (v22 recommended)
- Restart terminal after installation

### Error: "Cannot find module"

**Solution:** Reinstall dependencies
```powershell
cd trading-ui
rm -r node_modules
npm install
npm run build
```

### Build takes too long (>60 seconds)

**Solution:** Clean build
```powershell
cd trading-ui
rm -r dist node_modules package-lock.json
npm install
npm run build
```

### dist folder is empty

**Solution:** Verify the build completed
- Check for error messages in console
- Try a clean rebuild (see above)
- Ensure you're in `trading-ui` directory before running `npm run build`

---

## Next Steps

After building successfully:

1. Return to project root: `cd ..`
2. Go to [SCAN.md](SCAN.md) to run security scanning
3. Check results and deploy if passed

---

## Quick Reference

| Command | Purpose | Location |
|---------|---------|----------|
| `cd trading-ui` | Enter UI directory | Project root |
| `npm run build` | Build production bundle | trading-ui/ |
| `cd ..` | Return to project root | trading-ui/ |
| `ls dist/trading-ui/browser/` | Verify build | trading-ui/ |

---

**Status:  Ready to Build**
**Next:** [SCAN.md](SCAN.md)
