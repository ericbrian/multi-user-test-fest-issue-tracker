````markdown
---
name: kubernetes-eks-alb-internal
description: Kubernetes runtime skill for this app on EKS: ALB ingress, proxy/cookie behavior, Socket.IO replicas=1, and config/secrets expectations.
---

# Kubernetes (EKS) — ALB Ingress + Entra + Socket.IO

> [!NOTE]
> **Persona**: You are a Kubernetes SRE. You focus on safe defaults, correctness behind ingress/proxies, and operational readiness.

## Scope

This skill is specific to this repo’s application running on EKS using ALB Ingress.

## Non-negotiables

- **Ingress must be internal-only**
  - Use `alb.ingress.kubernetes.io/scheme: internal`
  - Restrict inbound to corporate CIDRs (via ALB SG rules and/or `alb.ingress.kubernetes.io/inbound-cidrs`)

- **Entra login must work**
  - ALB must terminate HTTPS
  - Use a stable internal hostname that matches `ENTRA_REDIRECT_URI`

- **Realtime (Socket.IO) day-0**
  - Recommend Redis day-0 so `replicas: 2+` is safe

## Required Kubernetes configuration

- ConfigMap requirements:
  - `NODE_ENV=production`, `PORT=3000`
  - `DB_SCHEMA=testfest`
  - `TRUST_PROXY=1` (Express must trust the ALB proxy for secure cookies)
  - Entra vars: `ENTRA_ISSUER`, `ENTRA_CLIENT_ID`, `ENTRA_REDIRECT_URI`

- Secret requirements:
  - `DATABASE_URL`
  - `SESSION_SECRET`
  - `ENTRA_CLIENT_SECRET`
  - Optional Jira secrets

## Ingress/TLS expectations

- Use ALB Ingress annotations for certificate + HTTPS listener
- Enable redirect to HTTPS (avoid mixed scheme issues)
- Health check path: `GET /health`

## Uploads behavior (when S3 backend is enabled)

- Images are served through the app at `/uploads/*`
- Stored in S3 under `uploads/<roomId>/<uuid>.<ext>`

## Operational checks

- `/health` returns 200 through the ALB
- Login completes end-to-end (Entra redirect URI matches internal hostname)
- Session cookie is set and persists across requests (proxy + secure cookie correctness)
- Socket.IO connects and room join/issue broadcast works (replicas=1 day-0)

## Repo pointers

- Manifests: `aws/k8s/*`
  - `aws/k8s/ingress.yaml`
  - `aws/k8s/deployment.yaml`
  - `aws/k8s/configmap.yaml`

## Related links

- AWS skill: `../aws/SKILL.md`
- Terraform skill: `../terraform/SKILL.md`
- Redis skill: `../redis/SKILL.md`

````
