# Our deployment vs. the course kit

The course kit is [IM-RAHUL-RAJ/Cloud-Deployment-Setup](https://github.com/IM-RAHUL-RAJ/Cloud-Deployment-Setup),
written for the course's sample trading app. We followed its steps and its AWS
choices (ECR, EKS, RDS, Jenkins, CloudFront in ap-south-1) and changed the parts
that only fit that sample app. This page lists each difference and why.

| Part | Kit | Ours |
|---|---|---|
| Kubernetes manifests | `k8s/base` + overlays `four-lb` / `ingress` | `k8s/base` only (`k8s/README.md`) |
| Load balancers | 3-4, one per service | **1**, the `gateway` |
| How the UI finds the APIs | URLs baked in at build time (`BUILD_ENV`), or rewritten at container start (`URL_REWRITES`) | worked out in the browser from the page's own address: no URLs anywhere |
| Jenkins CI | `jenkins/JenkinsfileCI` | `JenkinsfileCI` (root) |
| Jenkins CD | `jenkins/JenkinsfileCD` | `JenkinsfileCD` (root) |
| Secrets in CD | written into the Jenkinsfile | Jenkins Secret file credential `etp-k8s-secrets-env` |
| CloudFront | 3 origins (one per load balancer), path behaviors in CloudFront | **1** origin (gateway, port 80), routing by path in the gateway (`cloudfront/README.md`) |

## 1. Kubernetes

**Same as the kit.** A namespace, a gp3 StorageClass, single-node Kafka (KRaft) on
an EBS disk, a Job that creates the topics, one Deployment per service, the
images from ECR (`etp-auth-service`, `etp-order-service`, `etp-executor-service`,
`etp-frontend`), the RDS instance as the database, settings from `config.env`
and secrets from a git-ignored `secrets.env`, an eksctl cluster file with the EBS
CSI addon.

**Different, and why:**

- **Names.** Our services are `trade-api`, `auth-service`, `trade-executor` and
  `trading-ui` (the kit: `order-service`, `executor-service`, `frontend`), in
  namespace `ferodha`. The setting names in `config.env` are the ones our code
  reads (`POSTGRES_HOST`, `POSTGRES_DB`...; the kit: `DB_HOST`, `DB_NAME`...).
- **One load balancer instead of four.** Our UI calls the APIs on the page's own
  hostname at `:3000` and `:8081` (`trading-ui/src/environments`). With the kit's
  `four-lb` overlay each service gets a different hostname, so the UI would call
  addresses that do not exist and login fails. The `gateway` (nginx) is one load
  balancer with one hostname that answers on `:4200` (UI), `:3000` (auth) and
  `:8081` (trade API). One load balancer also costs a quarter of four, and there
  is no `urls.env` to fill in by hand. The executor stays internal: nothing
  outside the cluster calls it (the kit's overlay makes it public too).
- **Startup order.** trade-api runs the Liquibase migrations that auth-service
  and trade-executor depend on, so those two wait for trade-api's health (an
  init container), as `depends_on` does under compose.
- **Exactly one executor.** It also runs the price feed and the market maker; two
  copies would publish duplicate prices and counter-orders. `replicas: 1` with
  the `Recreate` strategy, so even a rollout never runs two.
- **Kafka.** `enableServiceLinks: false` (otherwise Kubernetes' own `KAFKA_PORT=tcp://...`
  variable is read by the image as broker config and breaks it), and the data in a
  sub-folder of the disk (a fresh disk's `lost+found` stops Kafka). Our six topics
  (`orders`, `trade-events`, `market-data` and their `.DLT`) with compose's partitions
  and retention.
- **No `generated/application.yml`, no `optional/postgres`.** Our services take their
  settings from environment variables only, and the database is always RDS.
- **The UI image.** One nginx image serves both apps: the trading UI at `/` and the
  admin console at `/admin/` (the kit's frontend is one app).

## 2. Jenkins CI (`JenkinsfileCI`)

**Same as the kit:** checkout, check that aws and docker exist, create missing ECR
repositories, build the four images, tag `1.<build number>`, push, print
`IMAGE_TAG=1.N` for CD.

**Different, and why:**

- **Our folders:** `auth_service`, `trade_api`, `trade_executor`, `trading-ui`
  (the kit: `services/...`, `frontend`).
- **No `K8S_OVERLAY` parameter, no `urls.env`, no `--build-arg BUILD_ENV`.** The kit
  bakes the load balancer addresses into the frontend at build time. Ours needs
  none, so one image works on a laptop, under compose on EC2, behind the gateway
  and behind CloudFront without a rebuild. CI also never knows those addresses:
  the load balancer exists only after CD has deployed.

## 3. Jenkins CD (`JenkinsfileCD`)

**Same as the kit:** run by hand with the CI tag, check the EKS cluster is ACTIVE
and has the EBS driver, test RDS from a throwaway `postgres:16` pod, open the RDS
security group only if that test fails, check the four images exist in ECR,
dry-run, apply, wait for the rollouts, delete the secrets file afterwards.

**Different, and why:**

- **No secrets in the file.** The kit writes passwords and API keys into the
  Jenkinsfile (its own `jenkins-steps.md` says not to, and its git history still
  shows real ones). Ours copies the Jenkins **Secret file** credential
  `etp-k8s-secrets-env` (the ID the kit's docs name) into `secrets.env`, with our
  key names: `POSTGRES_PASSWORD`, `JWT_SECRET`, `FAUXNANCE_API_KEY`, `SMTP_USER`,
  `SMTP_PASSWORD`.
- **Our cluster and manifests:** cluster `ferodha`, `k8s/base`, namespace `ferodha`,
  our Deployment names.
- **Defaults for our setup:** database and user `postgres`, our market data URL;
  no default RDS endpoint (the kit's is another account's database).
- **CORS is found, not typed.** The kit has you copy load balancer addresses into
  files. Ours reads the gateway's address and sets
  `CORS_ALLOWED_ORIGINS=http://<lb>:4200` itself (on the very first deploy: apply,
  wait for the address, apply again). A typed value with a trailing slash or a
  missing port made every call fail with "could not be reached". The optional
  `CLOUDFRONT_URL` parameter adds the CloudFront address.
- **One rollout, the right images.** The kit applies (with whatever image the
  manifests name) and then runs `kubectl set image`, which is two rollouts. Ours
  writes the account ID and tag into the workspace's `kustomization.yaml` first,
  then applies once, so each service restarts once, straight onto the new image. The tag
  is quoted: kustomize rejects `newTag: 1.7` because YAML reads it as a number.
- **RDS access** through the EKS cluster security group (as in `k8s/README.md`),
  not "the first security group of some node".
- **Longer waits** (600 s per rollout): trade-api runs its migrations first and the
  others wait for it; 180 s failed deployments that were fine.

## 4. CloudFront (`cloudfront/README.md`)

**Same as the kit:** one HTTPS address for everything; the browser never calls a
load balancer directly; origin protocol HTTP only; cache policy CachingDisabled;
origin request policy AllViewerExceptHostHeader (or the `Authorization` header is
dropped and every call after login is 401); all HTTP methods allowed.

**Different, and why:**

- **One origin, not three.** The kit points CloudFront at three load balancers on
  three ports and routes `/auth/*` and `/api/v1/*` with CloudFront behaviors. Ours
  points it at the gateway's **port 80**, and the gateway routes by path:
  `/auth-api/*` to auth-service, `/api/v1/*` to trade-api, everything else to the
  UI. One origin and one behavior to configure in the console, and still one load
  balancer.
- **`/auth-api/`, not `/auth/`.** Our auth service also answers on `/profile` and
  `/admin/...`, which are pages of our UI and of the admin console. On one address
  `/admin/users` would be both the console page and the auth API. The gateway puts
  the auth API under `/auth-api/` and strips that prefix before passing it on, so
  nothing in the auth service changed.
- **No `URL_REWRITES`.** The kit edits the built JavaScript at container start to
  remove baked-in addresses. Ours: opened without a port (CloudFront, or
  `http://<lb>/`), the UI calls the APIs by path on its own address; opened with
  one (`:4200`, localhost, EC2 compose) it calls `:3000` and `:8081` as before.
  The token is still sent only to the protected API paths, now including the
  `/auth-api` prefix (`token-allow-list.ts`, `admin-token.interceptor.ts`, with
  tests).
- **CORS.** The trade API compares the browser's origin exactly, and through
  CloudFront that origin is `https://<distribution>.cloudfront.net`; CD adds it from
  `CLOUDFRONT_URL`.
- **Redirects.** The UI's nginx uses relative redirects (`absolute_redirect off`), so
  `/admin` -> `/admin/` stays on the CloudFront address instead of jumping to the load
  balancer.

## Files

| File | What |
|---|---|
| `k8s/` | manifests and `README.md` (manual deployment) |
| `JenkinsfileCI`, `JenkinsfileCD` | the two Jenkins jobs |
| `cloudfront/README.md` | the CloudFront distribution, by hand |
| `trading-ui/src/environments/environment.ts`, `trading-ui/projects/admin/src/environments/environment.ts` | API addresses: by port, or by path on one address |
| `trading-ui/nginx.conf` | the UI image's nginx |
| `docker-compose.yml` | the same app on one EC2 machine, no Kubernetes |
