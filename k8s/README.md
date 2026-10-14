# k8s

Ferodha on Amazon EKS: the same five pieces as `docker-compose.yml` (Kafka,
trade-api, auth-service, trade-executor, trading-ui) against the existing RDS
instance, plus one gateway that gives the browser a single address.

```
k8s/
├── cluster.example.yaml         eksctl: the cluster, in the RDS instance's VPC
└── base/
    ├── kustomization.yaml       resource list, generated ConfigMap/Secret, ECR images
    ├── config.env               non-secret settings (our variable names)
    ├── secrets.env.example      copy to secrets.env (git-ignored) and fill in
    ├── namespace.yaml           namespace ferodha
    ├── storageclass.yaml        encrypted gp3 disks (Kafka)
    ├── kafka.yaml               single-node KRaft broker, kafka:29092
    ├── kafka-topics-job.yaml    the six topics (kafka-init under compose)
    ├── trade-api.yaml           8081, runs Liquibase
    ├── auth-service.yaml        3000, waits for trade-api
    ├── trade-executor.yaml      8082, exactly one copy, waits for trade-api
    ├── trading-ui.yaml          nginx: UI at /, admin console at /admin/
    └── gateway.yaml             ONE load balancer: :4200 UI, :3000 auth, :8081 trade API
```

The browser reaches everything through one hostname:
`http://<lb>:4200` (UI), `http://<lb>:4200/admin` (console), and the APIs on
`:3000` and `:8081` of the same host, which is how the UI finds them.

## Steps

Run everything on the EC2 machine, from the repository root, in one terminal (the
variables set in step 1 are used later).

### 0. Tools

```bash
aws --version || sudo snap install aws-cli --classic
kubectl version --client || sudo snap install kubectl --classic
eksctl version || { curl -sL "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_Linux_amd64.tar.gz" | tar xz -C /tmp && sudo install -m 0755 /tmp/eksctl /usr/local/bin/eksctl; }
aws sts get-caller-identity        # must print your account: creating EKS needs broad IAM permissions
```

### 1. AWS context

```bash
export AWS_REGION=ap-south-1
export CLUSTER_NAME=ferodha
export RDS_ID=<your RDS instance identifier, e.g. database-1>
aws configure set region "$AWS_REGION"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

### 2. Put the cluster in the RDS instance's VPC

A cluster in its own new VPC (eksctl's default) cannot reach RDS without VPC peering.

```bash
RDS_VPC=$(aws rds describe-db-instances --db-instance-identifier "$RDS_ID" \
  --query 'DBInstances[0].DBSubnetGroup.VpcId' --output text)
aws ec2 describe-subnets --filters "Name=vpc-id,Values=$RDS_VPC" \
  --query 'Subnets[].[SubnetId,AvailabilityZone,MapPublicIpOnLaunch]' --output table
```

Pick two subnets with `True` (public) in **different** availability zones and put
them in `k8s/cluster.example.yaml` (the zone names there must match yours). Then let
load balancers use them:

```bash
aws ec2 create-tags --resources <SUBNET_ID_A> <SUBNET_ID_B> --tags Key=kubernetes.io/role/elb,Value=1
```

### 3. Create the cluster (15-20 minutes)

```bash
eksctl create cluster -f k8s/cluster.example.yaml
aws eks update-kubeconfig --region "$AWS_REGION" --name "$CLUSTER_NAME"
kubectl get nodes                                  # two nodes, Ready
kubectl get pods -n kube-system | grep ebs         # the EBS driver is running
```

### 4. Images in ECR

Push the four images as in their `ECR.md`, with our folders in the build step:

```bash
docker build -t etp-auth-service     ./auth_service
docker build -t etp-order-service    ./trade_api
docker build -t etp-executor-service ./trade_executor
docker build -t etp-frontend         ./trading-ui
```

Then point the manifests at your account:

```bash
sed -i "s/<AWS_ACCOUNT_ID>/$AWS_ACCOUNT_ID/" k8s/base/kustomization.yaml
grep newName k8s/base/kustomization.yaml
```

### 5. Let the cluster reach RDS

```bash
RDS_SG=$(aws rds describe-db-instances --db-instance-identifier "$RDS_ID" \
  --query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' --output text)
NODE_SG=$(aws eks describe-cluster --name "$CLUSTER_NAME" \
  --query 'cluster.resourcesVpcConfig.clusterSecurityGroupId' --output text)
aws ec2 authorize-security-group-ingress --group-id "$RDS_SG" --protocol tcp --port 5432 \
  --source-group "$NODE_SG" || echo "The rule may already exist."
```

### 6. Settings and secrets

```bash
nano k8s/base/config.env                 # <RDS_ENDPOINT>, <DB_NAME>, <RDS_USER>, <FAUXNANCE_API_URL>
cp k8s/base/secrets.env.example k8s/base/secrets.env
nano k8s/base/secrets.env                # POSTGRES_PASSWORD, JWT_SECRET, FAUXNANCE_API_KEY
```

Same values as the root `.env`. `secrets.env` is git-ignored: never commit it.

### 7. Stop the compose stack

Two stacks on one RDS means two executors (duplicate prices and counter-orders) and
too many database connections.

```bash
docker compose down
```

### 8. Deploy

```bash
kubectl kustomize k8s/base > /tmp/ferodha.yaml     # renders everything; fails on a mistake
kubectl apply -k k8s/base
kubectl -n ferodha get pods -w                     # all Running and 1/1; kafka-topics Completed
```

trade-api starts first (Liquibase); auth-service and trade-executor show
`Init:0/1` until it is healthy. That is expected.

### 9. Give CORS the load balancer's address

```bash
kubectl -n ferodha get svc gateway        # EXTERNAL-IP: xxxx.ap-south-1.elb.amazonaws.com (takes 1-2 minutes)
```

Set `CORS_ALLOWED_ORIGINS=http://<that address>:4200` in `k8s/base/config.env`, then:

```bash
kubectl apply -k k8s/base                 # the services restart with the new value
```

### 10. Open it

`http://<that address>:4200` and `http://<that address>:4200/admin`. The load
balancer's DNS name can take a few minutes to resolve the first time.

## Day to day

| Task | Command |
|---|---|
| What runs | `kubectl -n ferodha get pods` |
| A service's log | `kubectl -n ferodha logs deploy/trade-api --tail=100` |
| Sign-up codes (no SMTP) | `kubectl -n ferodha logs deploy/auth-service \| grep -i code` |
| Why a pod is stuck | `kubectl -n ferodha describe pod <pod>` |
| New code | rebuild and push the image with a new tag, set `newTag` in `kustomization.yaml`, `kubectl apply -k k8s/base` |
| Topics again | `kubectl -n ferodha delete job kafka-topics && kubectl apply -k k8s/base` |
| Remove the app | `kubectl delete -k k8s/base` |
| Remove the cluster (stops the cost) | `eksctl delete cluster --region "$AWS_REGION" --name "$CLUSTER_NAME"` |

## If something fails

| Symptom | Cause |
|---|---|
| kafka-0 `Pending` | The EBS driver is missing: step 3, `kubectl get pvc -n ferodha` |
| `ImagePullBackOff` | `<AWS_ACCOUNT_ID>` not replaced, or the image was not pushed (step 4) |
| trade-api restarts, log: `Connection ... timed out` | RDS security group (step 5), or the cluster is not in the RDS VPC (step 2) |
| auth-service log: `self-signed certificate` / `no encryption` | `PGSSLMODE=no-verify` missing in `config.env` |
| gateway `EXTERNAL-IP` stays `<pending>` | The subnets are not tagged (step 2) |
| Browser: "could not be reached" | `CORS_ALLOWED_ORIGINS` is not exactly `http://<lb>:4200` (step 9) |
