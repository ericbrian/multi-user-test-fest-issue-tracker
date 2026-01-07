# testfest_step2_provisioning

Step 2 of the org-required 2-step Terraform process.

Goal: provision the **runtime services** needed to run Test Fest, consuming outputs from Step 1.

Typical responsibilities (adjust to match your protected repo standards):

- EKS cluster + managed node group(s) (or wiring to an existing EKS cluster)
- AWS Load Balancer Controller installation (if not done centrally)
- ECR repository for app image (`testfest-app`)
- RDS Postgres (or connectivity to an existing instance)
- Optional: S3 bucket for uploads + IRSA role/policy for the app

## Required inputs (from Step 1)

Examples:

- VPC ID, private/public subnet IDs
- Security group IDs
- IAM role ARNs (controller/app)

## Outputs needed by the app team

- EKS cluster name/region (or kubeconfig access path)
- ECR repo URI
- RDS endpoint + `DATABASE_URL` components
- Optional: ACM cert ARN + Route53 record (if you manage DNS/TLS here)
