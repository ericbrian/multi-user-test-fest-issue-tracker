````markdown
---
name: aws-eks-internal-app
description: AWS deployment skill for this app: internal-only EKS + ALB Ingress + RDS Postgres + Entra SSO DNS/TLS requirements.
---

# AWS (EKS) Deployment — Internal App + Entra SSO

> [!NOTE]
> **Persona**: You are a Cloud/Platform Engineer. You optimize for security-by-default (private networking), repeatable deployments, and clear handoffs between cloud and app teams.

## Scope

This skill is specific to this repo’s application (`multi-user-test-fest-issue-tracker`).

Target runtime on AWS:

- EKS (Kubernetes)
- AWS Load Balancer Controller (ALB Ingress)
- RDS Postgres (required)
- Optional S3 (private) for uploads

## Non-negotiables

- **Internal-only access** (behind company firewall)
  - Internal ALB
  - Inbound restricted to corporate CIDRs (VPN/office)

- **Entra login must work**
  - Stable internal hostname
  - HTTPS/TLS termination at ALB
  - Redirect URI: `https://<internal-host>/auth/callback`

- **Day-0 replicas**
  - Recommend Redis day-0 so `replicas: 2+` is safe for Socket.IO

## AWS resource expectations

- **ECR**
  - App image repository exists (repo URI handed to app team)

- **EKS**
  - Cluster + node group(s) able to run Node.js workload
  - AWS Load Balancer Controller installed and working
  - Cluster OIDC provider enabled (IRSA)

- **RDS Postgres**
  - Reachable from EKS
  - Security group rules: EKS → RDS `5432`
  - Provide `DATABASE_URL` usable by the application
  - App uses schema `testfest` (migrations create objects there)

- **DNS + TLS**
  - Private DNS entry (Route53 private hosted zone or corporate DNS integration)
  - Certificate attached to ALB for internal hostname
    - Corporate/internal CA import or ACM Private CA (org standard)

- **Optional S3 uploads**
  - Bucket is private, public access blocked, encryption enabled
  - Prefer IRSA for auth
  - Objects stored as `uploads/<roomId>/<uuid>.<ext>`

## App configuration requirements (AWS runtime)

- `TRUST_PROXY=1` (ALB terminates TLS; secure cookies require correct proxy handling)
- `DB_SCHEMA=testfest`
- `ENTRA_ISSUER`, `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_REDIRECT_URI`
- `SOCKETIO_REDIS_ENABLED=true` and `REDIS_URL=...` (if scaling beyond 1 replica)

## What the cloud team must return to the app team

- EKS cluster name + region
- Confirmation AWS Load Balancer Controller is installed
- ECR repo URI
- `DATABASE_URL` (or components)
- Internal hostname + cert attachment reference/method
- Confirmed corporate CIDRs enforced (where and how)
- Optional S3: bucket name + IRSA role ARN

## Repo pointers

- K8s manifests applied by app team: `aws/k8s/*`
- AWS plan: `aws/AWS_EKS_DEPLOYMENT_PLAN.md`
- Terraform handoffs:
  - `aws/terraform/modules/testfest_step1_security/HANDOFF.md`
  - `aws/terraform/modules/testfest_step2_provisioning/HANDOFF.md`

## Related links

- Terraform skill: `../terraform/SKILL.md`
- Redis skill: `../redis/SKILL.md`

````
