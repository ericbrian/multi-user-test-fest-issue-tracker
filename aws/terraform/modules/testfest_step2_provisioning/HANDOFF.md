# Test Fest — Cloud Engineering Handoff (Step 2: Provisioning)

Date: 2026-01-05

This handoff is for the cloud engineering team that owns the protected Terraform repo.

Scope: **Step 2** of the org-required 2-step Terraform process.

- Step 1: VPC/networking + IAM/policies/roles + security groups (covered in `../testfest_step1_security/HANDOFF.md`)
- Step 2: EKS/RDS/ECR/S3 and other runtime resources

## Context (what we’re building)

- Runtime: EKS (Kubernetes)
- Ingress: AWS Load Balancer Controller (ALB Ingress)
- Database: RDS Postgres
- Realtime: Socket.IO

Day-0 constraint: the app will deploy with **replicas=1**.

Update: With Redis provisioned day-0 (see below) and the Socket.IO Redis adapter enabled, the repo now defaults the deployment to **replicas=2** for basic HA.
You may still choose to start at **replicas=1** for the simplest first cut.

Access constraint: this app must live **behind the company firewall** (internal-only). End users must be on the corporate network (e.g. VPN) to reach it.

## Step 2 inputs required from Step 1

Step 2 must consume outputs from Step 1, typically:

- VPC ID
- Public subnet IDs
- Private subnet IDs
- Security group IDs
- IRSA role ARN(s) and/or conventions
- (If applicable) Route53 hosted zone info

## Step 2 requirements (Terraform)

### A) EKS cluster + node group(s)

Minimum day-0 requirements:

- EKS cluster in the chosen region
- Managed node group capable of running a single small Node.js pod
- Cluster OIDC provider enabled (required for IRSA)

Recommended add-ons:

- AWS Load Balancer Controller installed and working
  - IRSA role for the controller
  - Helm chart install (or your existing standard)

Network expectation:

- The app will be exposed via an **internal ALB** (see `aws/k8s/ingress.yaml`).

### B) ECR repository

We need an ECR repo for the application image.

Kubernetes manifest placeholder expects repo name:

- `testfest-repo`

Deliverable outputs:

- ECR repository URI (e.g. `<acct>.dkr.ecr.<region>.amazonaws.com/testfest-repo`)

### C) RDS Postgres

We need a Postgres instance reachable from EKS.

Minimum day-0 requirements:

- RDS Postgres instance (single-AZ ok for day-0)
- DB name (any), user, password
- Security group rules allowing EKS workloads to connect on `5432`

Important notes:

- The Prisma migrations will create tables in schema `testfest`.
  - Ensure the DB user can create schema/objects, or pre-create schema `testfest` and grant permissions.
- App team will run: `npx prisma migrate deploy` once `DATABASE_URL` is set.

Deliverable outputs:

- RDS endpoint/port
- A `DATABASE_URL` value usable by the app

### D) Redis (ElastiCache) for Socket.IO (day-0 recommended)

We recommend provisioning Redis day-0 so Socket.IO broadcasts work across multiple replicas.

Requirements:

- ElastiCache Redis (or org-standard Redis offering) reachable from EKS workloads
- Security group rules allowing EKS → Redis (typically `6379`)
- Provide a `REDIS_URL` usable by the app

App config:

- `SOCKETIO_REDIS_ENABLED=true`
- `REDIS_URL=redis://:PASSWORD@HOST:6379` (include TLS/auth parameters per org standard)

Kubernetes note:

- The repo’s default `aws/k8s/deployment.yaml` is set to `replicas: 2` assuming Redis is enabled.

`DATABASE_URL` format:

- `postgresql://USER:PASSWORD@HOST:5432/DBNAME`

(If your org standard requires SSL parameters, include them in the URL.)

### E) TLS certificate + DNS (recommended)

DNS + TLS is required for day-0 because Entra login must work end-to-end.

Requirements:

- Internal DNS name (recommended: Route53 **private hosted zone**) pointing to the internal ALB
- TLS certificate approach for an internal hostname (choose one):
  - Import a certificate issued by your corporate/internal CA
  - Use ACM Private CA (if your org has it)

Deliverable outputs:

- Certificate reference (ARN if ACM; otherwise how it will be attached)
- Chosen internal hostname

Entra redirect URI implication:

- `ENTRA_REDIRECT_URI` must use the internal hostname (e.g. `https://issues.internal.example.com/auth/callback`).

## Uploads storage (images)

Day-0 (current behavior):

- Uploaded images are stored on the pod/container filesystem at `./uploads` and served from the app at `/uploads/*`.
- This is acceptable for day-0, but images can be lost if the pod is rescheduled.

Target (durable storage):

- Private S3 bucket with objects stored under prefix `uploads/`.
- Bucket remains private; the app continues to serve images behind `/uploads/*` (by streaming/proxying from S3).

Outbound egress note:

- Even though the app is internal-only inbound, the pods will still need outbound egress to reach:
  - Entra ID endpoints for authentication
  - Jira API endpoints if Jira integration is enabled

### E) Optional: S3 uploads bucket (nice-to-have)

If provisioning now (optional):

- Private S3 bucket
- Block public access
- Default encryption
- IAM policy granting RW to prefix `uploads/`

Preferred auth: IRSA role bound to the app’s Kubernetes service account.

Deliverable outputs:

- Bucket name
- IAM role ARN for the app service account

## Kubernetes deploy interface (what the app team will apply)

The app team will apply manifests from `aws/k8s/`.

Notable expectations:

- Ingress: ALB, **internal** (behind firewall), target-type `ip`, sticky sessions enabled
- Service: NodePort
- Deployment:
  - `replicas: 1`
  - readiness/liveness: `GET /health` on port `3000`

Kubernetes Secret must include:

- `DATABASE_URL`
- `SESSION_SECRET`
- `ENTRA_CLIENT_SECRET`

Kubernetes ConfigMap must include:

- `NODE_ENV=production`
- `PORT=3000`
- `DB_SCHEMA=testfest`
- `ENTRA_ISSUER`, `ENTRA_CLIENT_ID`, `ENTRA_REDIRECT_URI`

## What we need from you (cloud team) as concrete outputs

Please provide these values back to the app team:

- EKS cluster name + region
- Confirmation that AWS Load Balancer Controller is installed
- Repo URI for `testfest-repo`
- `DATABASE_URL` (or the components to construct it)
- `REDIS_URL` (or its components)
- Any required SSL flags/CA requirements
- If using custom domain: public hostname + ACM certificate ARN
- If S3 provisioned: bucket name + IRSA role ARN

## Day-0 checklist (cloud team)

- Provision EKS + AWS Load Balancer Controller
- Create ECR repo `testfest-repo`
- Create RDS Postgres and connectivity to EKS
- Provision Redis (ElastiCache) and connectivity to EKS
- Optional: ACM/DNS
- Optional: S3 + IRSA role for app

## Acceptance criteria

- ALB health checks succeed at `GET /health`
- Entra login works end-to-end
- Rooms + issues function
- Real-time updates work within a single replica

## Open decisions/questions

- Target AWS region?
- Day-0 DNS/TLS: internal hostname + internal certificate approach (corporate CA / ACM Private CA)?
- RDS sizing/HA for day-0: single-AZ small instance ok?
- Optional S3 provisioning now vs later?
