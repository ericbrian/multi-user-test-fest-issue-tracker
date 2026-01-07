# testfest Terraform modules (2-step process)

Our org requires a **2-step Terraform process**:

1. **Step 1 (Security/Foundation):** networking + IAM/policies/roles (VPC, subnets, security groups, IRSA roles, controller roles, etc.).
2. **Step 2 (Provisioning):** EKS/RDS/ECR/S3 and other resources that depend on Step 1 outputs.

This repo intentionally keeps only placeholder scaffolding. The protected Terraform repo should implement the real stacks using your standard patterns.

## Module layout

- `../testfest_step1_security/`
  - VPC/VPC attachments (if applicable)
  - security groups (EKS→RDS, ALB→pods)
  - IAM roles/policies (ALB controller IRSA, app IRSA, etc.)

- `../testfest_step2_provisioning/`
  - EKS cluster + node groups (or consumes an existing cluster)
  - ECR repo (`testfest-app`)
  - RDS Postgres (or consumes an existing instance)
  - optional S3 bucket for uploads

## Apply order

- Apply Step 1 first.
- Step 2 takes Step 1 outputs as inputs (VPC/subnets, SG IDs, role ARNs, OIDC provider info).
