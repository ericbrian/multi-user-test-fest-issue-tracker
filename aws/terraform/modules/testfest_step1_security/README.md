# testfest_step1_security

Step 1 of the org-required 2-step Terraform process.

Goal: create the **security/foundation** layer that other stacks depend on.

Typical responsibilities (adjust to match your protected repo standards):

- VPC and subnets (or VPC attachments to an existing shared VPC)
- Security groups and network rules
  - ALB → EKS pods (port 3000)
  - EKS → RDS (port 5432)
- IAM roles/policies
  - AWS Load Balancer Controller IRSA role
  - (Optional) App IRSA role (for S3 uploads)
- KMS keys (if org policy requires CMKs)

## Inputs (examples)

- `name`: naming prefix
- `tags`: standard tags
- VPC settings (CIDR, subnets) OR existing VPC/subnet IDs

## Outputs (examples)

- VPC ID, subnet IDs
- Security group IDs
- IRSA role ARNs
- EKS OIDC provider info (if created here; otherwise in Step 2)
