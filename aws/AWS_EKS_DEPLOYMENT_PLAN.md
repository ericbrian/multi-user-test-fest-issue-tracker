# AWS + EKS Deployment Plan (Working Doc)

Purpose: single source of truth for moving this app from Heroku-ready to AWS-ready, with Kubernetes (EKS) as the runtime. This doc is meant to be executable: a checklist + concrete decisions + open questions.

Provisioning note: the AWS infrastructure for this plan should be codified in Terraform as a `testfest` module located at `aws/terraform/modules/testfest/`.

## Current State (Repo)

- App: Node/Express + Socket.IO, Prisma for app DB.
- Sessions: Postgres-backed via `connect-pg-simple`.
- AWS K8s manifests live under `aws/k8s/` and are ALB-ingress-oriented.
- Uploads are currently stored on the container filesystem under `./uploads` and served at `/uploads/*`.
- Jira integration creates issues via API token.

## Target Architecture (Decision)

Default target for tomorrow: **EKS + AWS Load Balancer Controller (ALB Ingress)**.

Access requirement: this app must live **behind the company firewall** (internal-only). Use an **internal ALB** and restrict inbound to corporate networks (VPN/office CIDRs). End users must be on the corporate network to access the app.

Initial rollout decision (to reduce risk):

- **Introduce Redis day-0** (ElastiCache) and enable the Socket.IO Redis adapter.
- Default to `replicas: 2` for basic HA once Redis is in place.
- You may still start with `replicas: 1` if you want the simplest possible first cut.

Why: With multiple pods, Socket.IO events won’t broadcast across pods without a shared adapter (Redis). ALB stickiness keeps a single client pinned, but it does not synchronize events across pods.

## Database Decision (Agreed)

We will use **RDS Postgres** and keep the existing code.

Why:

- Lowest engineering risk (no DB rewrite / no migration work).
- Works naturally with Kubernetes (no shared filesystem DB file).
- Easiest operational story (managed backups, standard HA options).

SQLite was considered but rejected for EKS because it forces single-replica + PVC + DIY backups and creates a harder path to scaling.

## K8s Config Note

The app reads schema from `DB_SCHEMA` (validated in `src/config.js`).

- Ensure `aws/k8s/configmap.yaml` uses `DB_SCHEMA` (not `SCHEMA`).

## Day-0 Checklist (Tomorrow)

### 1) AWS prerequisites

- [ ] AWS account access + CLI configured (`aws sts get-caller-identity` works)
- [ ] Region chosen
- [ ] DNS + TLS (required for Entra login):
  - Internal DNS name via Route53 private hosted zone (recommended) or corporate DNS integration, e.g. `issues.internal.example.com`
  - TLS certificate for that internal hostname (ACM Private CA or corporate CA import)
  - Entra app registration must include redirect URI: `https://<internal-host>/auth/callback`

### 2) Create/confirm EKS cluster

- [ ] EKS cluster exists
- [ ] AWS Load Balancer Controller installed
- [ ] Cluster has worker nodes and can schedule pods

### 3) Container image in ECR

- [ ] ECR repo created
- [ ] Docker image built and pushed
- [ ] `k8s/deployment.yaml` image set to ECR URI

### 4) Postgres (RDS)

- [ ] RDS Postgres created (or use existing)
- [ ] Security groups allow EKS → RDS
- [ ] `DATABASE_URL` set in K8s Secret
- [ ] Run migrations: `npx prisma migrate deploy`

### 5) Secrets + config

- [ ] K8s Secret contains:
  - `DATABASE_URL` (Postgres)
  - `SESSION_SECRET`
  - `ENTRA_CLIENT_SECRET`
  - optional Jira secrets
- [ ] K8s ConfigMap contains:
  - `NODE_ENV=production`, `PORT=3000`
  - `DB_SCHEMA=testfest`
  - `TRUST_PROXY=1` (required behind ALB so secure cookies work)
  - `SOCKETIO_REDIS_ENABLED=true`
  - `REDIS_URL=...` (ElastiCache endpoint)
  - Entra OIDC env vars

### 6) Ingress and WebSockets

- [ ] Ingress created (internal ALB) and ALB is healthy
- [ ] `/health` returns 200 from ALB
- [ ] WebSockets work through ALB (Socket.IO)

## S3 Uploads Plan

Goal: avoid container-local uploads so pod restarts don’t lose files.

Recommended approach for tomorrow:

- Bucket is **private**.
- App stores objects in S3 and continues to serve them behind `/uploads/*` by streaming from S3.
  - This avoids exposing public bucket access.
  - The UI keeps working (it already uses `/uploads/...` URLs).

### S3 environment variables (proposed)

- `UPLOADS_BACKEND=s3` (default: local)
- `S3_BUCKET=<bucket>`
- `S3_REGION=<region>`
- `S3_PREFIX=uploads/` (optional)

Auth options:

- **Preferred on EKS:** IRSA (IAM Role for Service Account)
- Alternative: static keys in Kubernetes Secret (only if you must)

### S3 bucket creation (AWS CLI template)

> This repo cannot create AWS resources directly (no AWS credentials/tools wired here). Use the following commands tomorrow.

```bash
# set these
export AWS_REGION=us-east-1
export BUCKET_NAME=testfest-tracker-uploads-<unique-suffix>

aws s3api create-bucket \
  --bucket "$BUCKET_NAME" \
  --region "$AWS_REGION" \
  $( [ "$AWS_REGION" = "us-east-1" ] && echo "" || echo "--create-bucket-configuration LocationConstraint=$AWS_REGION" )

# block public access
aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# optional: default encryption
aws s3api put-bucket-encryption \
  --bucket "$BUCKET_NAME" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
```

### IAM policy (least privilege) template

Replace `${BUCKET_NAME}` and optionally constrain prefix.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::${BUCKET_NAME}"],
      "Condition": {
        "StringLike": {
          "s3:prefix": ["uploads/*"]
        }
      }
    },
    {
      "Sid": "ObjectRW",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::${BUCKET_NAME}/uploads/*"]
    }
  ]
}
```

## Multi-Replica Realtime Plan (Day-0)

For day-0 Redis-backed realtime:

- Provision Redis (ElastiCache recommended)
- Set `SOCKETIO_REDIS_ENABLED=true` and `REDIS_URL=...`
- Then you may scale deployment to 2+ replicas

## DNS + TLS Plan

- Use ACM cert
- Configure ALB Ingress annotations for certificate ARN + HTTPS listener
- Set `ENTRA_REDIRECT_URI=https://<domain>/auth/callback`

## Open Questions (Answer these as we go)

- [ ] Confirm we’re deploying to EKS (not ECS): yes/no
- [ ] Pick region: `us-east-1`, `us-west-2`, etc.
- [ ] Do you have a domain ready for day-0, or use ALB DNS name initially?
- [ ] Are uploads required day-0, or can we temporarily accept pod-local disk?
- [ ] Is Redis already available in your AWS environment (Elasticache), or should we plan it later?

## Quick Verification Checklist (After Deploy)

- [ ] `/health` OK
- [ ] Login works (Entra)
- [ ] Join/create room works
- [ ] Create issue works
- [ ] Upload images works
- [ ] Images render for another user
- [ ] Realtime updates work (within replica=1)
- [ ] Send to Jira works (optional)
