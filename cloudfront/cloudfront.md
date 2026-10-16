# cloudfront

Ferodha on one HTTPS address: an AWS CloudFront distribution in front of the
Kubernetes gateway (`k8s/base/gateway.yaml`). Set up once, by hand, after the
app runs on EKS (`k8s/README.md`, or JenkinsfileCD).

```
https://<distribution>.cloudfront.net
        |  (HTTPS for the browser, plain HTTP to the origin)
        v
gateway load balancer, port 80                 ONE origin, ONE behavior
  /auth-api/*  -> auth-service :3000 (prefix removed)
  /api/v1/*    -> trade-api    :8081
  /*           -> trading-ui   :80   (UI at /, admin console at /admin/)
```

The routing by path happens in the gateway, not in CloudFront, so CloudFront has
a single origin and a single behavior. The UI notices it was opened without a
port and calls the APIs by path on its own address (`trading-ui/src/environments`).

The direct addresses keep working next to it: `http://<lb>:4200` (and `:3000`,
`:8081`), and `http://<lb>/` (port 80, the same routing as CloudFront).

## Steps

### 1. Images that know about it

The UI change and the gateway's port 80 must be deployed first: run `etp-ci`, then
`etp-cd` with its tag (CLOUDFRONT_URL still empty). Check port 80 answers:

```bash
LB=$(kubectl -n ferodha get svc gateway -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "$LB"
curl -s "http://$LB/auth-api/health"            # JSON from auth-service
curl -s -o /dev/null -w '%{http_code}\n' "http://$LB/api/v1/instruments"   # 401: routing works, no token
```

### 2. Create the distribution (console)

**CloudFront > Distributions > Create distribution**

| Setting | Value |
|---|---|
| Origin domain | the `$LB` hostname above, typed in (not picked from the list): no `http://`, no port |
| Protocol | **HTTP only** |
| HTTP port | **80** |
| Viewer protocol policy | Redirect HTTP to HTTPS |
| Allowed HTTP methods | GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE |
| Cache policy | **CachingDisabled** |
| Origin request policy | **AllViewerExceptHostHeader** |
| Web Application Firewall | Do not enable (it costs extra) |
| Default root object | leave empty |

- **CachingDisabled**: logins, prices and orders must never come from a cache.
- **AllViewerExceptHostHeader**: forwards the `Authorization` header (without it,
  sign-in works and every call after it is 401), `Content-Type`, `Origin` and
  query strings.

Create it, then wait until **Status** is **Enabled** and **Last modified** shows a
date, not "Deploying" (3-5 minutes). Copy the **Distribution domain name**
(`dxxxxxxxxxxxx.cloudfront.net`).

### 3. Allow its address (CORS)

Run `etp-cd` again with the same IMAGE_TAG and

```
CLOUDFRONT_URL=https://dxxxxxxxxxxxx.cloudfront.net
```

(`https`, no trailing slash: the pipeline also strips one). CORS_ALLOWED_ORIGINS
becomes `http://<lb>:4200,https://dxxxxxxxxxxxx.cloudfront.net`; the trade API
refuses a browser origin it does not list. Without Jenkins: add it to
`CORS_ALLOWED_ORIGINS` in `k8s/base/config.env` and `kubectl apply -k k8s/base`.

### 4. Open it

| URL | Expected |
|---|---|
| `https://<domain>/` | the landing page, with a padlock |
| `https://<domain>/admin` | the admin console sign-in |
| `https://<domain>/auth-api/health` | JSON from auth-service |
| `https://<domain>/api/v1/instruments` | a 401 JSON error (routing works; no token) |

Sign in with DevTools open (**Network**): the login request goes to
`https://<domain>/auth-api/auth/login` and returns 200.

## If something fails

| Symptom | Cause |
|---|---|
| 504 / timeout on every page | Origin HTTP port is not 80, or the gateway was deployed before it had port 80 (step 1) |
| 502 | Origin protocol is HTTPS (must be HTTP only), or the origin hostname is wrong |
| Login says "could not be reached" | The UI image is older than this change (it still calls `:3000`): run `etp-ci`, then `etp-cd` with the new tag |
| Login works, then everything is 401 | Origin request policy is not AllViewerExceptHostHeader |
| Orders and other trade calls fail with 403 "Invalid CORS request" | CLOUDFRONT_URL not given to `etp-cd`, or with a typo (step 3) |
| Old page after a deploy | `aws cloudfront create-invalidation --distribution-id <ID> --paths '/*'`, then Ctrl+Shift+R |
| Recreated the gateway Service (new load balancer name) | Edit the distribution's origin domain to the new name |

## Cost and removal

CloudFront charges per request and per GB, small at this scale. To remove it:
**Disable** the distribution, wait for it to finish, then **Delete**. Remove
CLOUDFRONT_URL from the next `etp-cd` run.