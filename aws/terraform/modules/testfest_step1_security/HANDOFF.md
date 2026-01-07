# Test Fest — Cloud Engineering Handoff (Step 1: Security/Foundation)

Date: 2026-01-05

This handoff is for the cloud engineering team that owns the protected Terraform repo.

Scope: **Step 1** of the org-required 2-step Terraform process.

- Step 1: VPC/networking + IAM/policies/roles + security groups
- Step 2: EKS/RDS/ECR/S3 and other runtime resources (covered in `../testfest_step2_provisioning/HANDOFF.md`)

## Context (what we’re building)

- Runtime: EKS (Kubernetes)
- Ingress: AWS Load Balancer Controller (ALB Ingress)
- Database: RDS Postgres
- Realtime: Socket.IO

Day-0 scaling note: the repo defaults to **replicas=2** once Redis is available (Socket.IO Redis adapter).
You may still start at **replicas=1** for the simplest first cut.

Access constraint: this app must live **behind the company firewall** (internal-only). That means the ALB should be **internal**, and inbound should be restricted to corporate networks (VPN/office CIDRs).

## App constraints that impact Step 1

### Postgres schema is fixed to `testfest`

- App config requires `DB_SCHEMA=testfest`.
- Prisma uses Postgres schema `testfest`.

### Connectivity expectations

- ALB targets pods directly (Ingress target-type `ip`).
- App pods listen on port `3000` and expose `GET /health`.
- App pods must be able to reach Postgres on `5432`.

## Step 1 requirements (Terraform)

### A) Networking

We expect a standard EKS VPC layout:

- Subnets for an **internal ALB** (your org standard; typically private subnets)
- Private subnets for worker nodes
- NAT egress for nodes (or equivalent)

Provide/confirm:

- VPC ID and subnet IDs (or define VPC creation as part of this step)
- DNS approach for internal-only access:
  - Route53 **private hosted zone** (recommended) or your corporate DNS integration
  - Internal hostname to be used for Entra redirect URI

Entra SSO requirement:

- DNS + TLS for the internal hostname is required for day-0 because Entra login must work end-to-end.
  - Provide an internal hostname and a TLS strategy (ACM Private CA and/or corporate CA import).

Firewall/CIDR restriction:

- Define the allowed inbound CIDRs (VPN/office ranges). These will be applied to the internal ALB via security groups and/or ALB Ingress annotations.

### B) IAM + policies + roles (IRSA)

Minimum day-0 requirements:

- EKS OIDC provider available for IRSA
  - If your standards create OIDC in Step 2, document the expected outputs here.
- IAM role/policy for AWS Load Balancer Controller (IRSA)

Optional (if provisioning S3 day-0):

- IAM role/policy for the app to access S3 (IRSA)

Deliverable outputs:

- Role ARN(s) and the required service account annotation conventions

### C) Security groups / connectivity

We need security group rules that allow:

- Internal ALB → EKS pods on `3000` (ALB target-type `ip`)
- EKS node/pod SG → RDS SG on `5432`

And restrict end-user ingress:

- Corporate CIDRs (VPN/office) → internal ALB listener ports (80/443)

Deliverable outputs:

- Security group IDs
- A short description of the intended traffic flow

### D) Subnet tagging (ALB controller discovery)

Ensure subnets are tagged per your standard so the ALB controller can discover them.

Deliverable outputs:

- Confirmation of required subnet tags (or that the standard baseline already applies them)

## Outputs Step 2 will require from Step 1

Please provide these outputs to the Step 2 stack/module:

- VPC ID
- Public subnet IDs
- Private subnet IDs
- Security group IDs (ALB-to-pods and EKS-to-RDS path)
- IRSA role ARN(s) for:
  - AWS Load Balancer Controller
  - optional app S3 access

## Open decisions/questions

- Target AWS region?
- Use existing VPC or create a dedicated VPC?
- Will OIDC provider be created in Step 1 or Step 2?
