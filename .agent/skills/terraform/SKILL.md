````markdown
---
name: terraform-aws-eks-handoff
description: Captures org-standard Terraform requirements for deploying this app on AWS/EKS (two-step process, internal-only access, Entra SSO constraints, and required outputs).
---

# Terraform (AWS/EKS) — Org Process + App Constraints

> [!NOTE]
> **Persona**: You are a Cloud Platform Engineer working in an org-controlled Terraform repo. You enforce the org-required 2-step workflow, keep resources private/internal by default, and return concrete outputs to the application team for deployment.

## Scope

This skill is **specific to** the app in this repo (`testfest-app`).

Target runtime:

- EKS (Kubernetes)
- ALB Ingress via AWS Load Balancer Controller
- RDS Postgres (required)
- Optional private S3 for uploads

## Non-negotiable requirements

- **Two-step Terraform process** is mandatory:
  - **Step 1 (Security/Foundation)**: networking, IAM, security groups, policies/roles, baseline security controls
  - **Step 2 (Provisioning)**: EKS/RDS/ECR/(optional S3) and runtime resources

- **Internal-only (behind company firewall)**:
  - Use an **internal ALB**
  - Restrict inbound to corporate networks (VPN/office CIDRs)

- **Entra login must work**:
  - Requires a **stable internal hostname** and **HTTPS/TLS**
  - `ENTRA_REDIRECT_URI` must be `https://<internal-host>/auth/callback`
  - Plan for internal DNS (Route53 private hosted zone or corporate DNS integration) + internal certificate attachment to ALB

## App constraints that drive Terraform and networking

- **Realtime**: Socket.IO
  - Recommend provisioning Redis day-0 so we can safely run 2+ replicas.

- **Sessions**: Postgres-backed sessions (`connect-pg-simple`)
  - RDS connectivity must be allowed from EKS workloads.

- **Schema**: Postgres schema is fixed to `testfest`
  - App expects `DB_SCHEMA=testfest`.

- **Proxy awareness**:
  - Behind ALB, `TRUST_PROXY=1` is required so secure cookies behave correctly.

## Step 1 (Security/Foundation) — expected deliverables

### Networking

- VPC and subnets aligned with org EKS standards
- Subnets suitable for an **internal ALB** (typically private subnets)
- NAT/egress so pods can reach:
  - Entra endpoints (auth)
  - Jira endpoints (optional)

### IAM / IRSA

- EKS OIDC provider enabled (or delivered as part of Step 2 per org standards)
- IRSA role/policy for AWS Load Balancer Controller
- Optional: IRSA role/policy for the application to access S3 (if S3 uploads are provisioned day-0)

### Security groups / traffic flow

- Corporate CIDRs → ALB (80/443)
- ALB → pods on port 3000 (target-type `ip`)
- EKS → RDS on 5432

### Required outputs to pass into Step 2

- VPC ID
- Subnet IDs (public/private per your org module expectations)
- Security group IDs
- IRSA role ARNs / service account annotation conventions
- DNS foundation outputs if applicable (private hosted zone ID/name)

## Step 2 (Provisioning) — expected deliverables

### EKS

- EKS cluster + node group(s) sized for day-0
- AWS Load Balancer Controller installed and operational

### ECR

- ECR repo for app image
  - Expected name: `testfest-app` (or provide the actual repo URI)

### RDS Postgres

- Postgres instance reachable from EKS
- Provide a usable `DATABASE_URL`
  - Prisma migrations will manage tables under schema `testfest`

### DNS + TLS (required)

- Internal hostname (private DNS) pointing to the internal ALB
- TLS certificate attached to ALB for that hostname
  - Corporate CA import or ACM Private CA (org standard)

### Optional: S3 uploads

### Redis (day-0 recommended)

- Provide a Redis endpoint reachable from EKS (ElastiCache recommended)
- App expects:
  - `SOCKETIO_REDIS_ENABLED=true`
  - `REDIS_URL=...`

If enabling durable uploads day-0:

- Private S3 bucket (block public access, encryption)
- IRSA for app service account preferred
- App stores objects under:
  - `uploads/<roomId>/<uuid>.<ext>`

## What to hand back to the app team (must-have outputs)

- EKS cluster name + region
- Confirmation AWS Load Balancer Controller is installed
- ECR repo URI
- `DATABASE_URL` (or its components)
- Internal hostname and certificate attachment method/reference
- Allowed inbound CIDRs applied (or where they are enforced)
- Optional S3: bucket name + IRSA role ARN

## Repo pointers (where the app team expects to plug in)

- Terraform handoff docs:
  - `aws/terraform/modules/testfest_step1_security/HANDOFF.md`
  - `aws/terraform/modules/testfest_step2_provisioning/HANDOFF.md`

- Kubernetes manifests applied by app team:
  - `aws/k8s/ingress.yaml` (internal ALB + TLS annotations placeholders)
  - `aws/k8s/configmap.yaml` (`DB_SCHEMA`, Entra config, `TRUST_PROXY=1`)
  - `aws/k8s/deployment.yaml` (`replicas: 1` day-0)

## Guardrails

- Do not create internet-facing ingress for this app.
- Do not assume DNS/TLS can be deferred if Entra SSO is required.
- Keep provider configuration in root stacks/workspaces, not inside reusable modules (org standard).

## Related links

- AWS skill: `../aws/SKILL.md`
- Kubernetes skill: `../kubernetes/SKILL.md`
- Redis skill: `../redis/SKILL.md`
- AWS deployment plan: `../../aws/AWS_EKS_DEPLOYMENT_PLAN.md`

````
