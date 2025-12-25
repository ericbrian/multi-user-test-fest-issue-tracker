# AWS Infrastructure - Network & IAM (Ops)

This folder contains the Terraform code for the baseline infrastructure that requires elevated permissions.

**This code is intended for the Operations/Security team.**

## Resources Provisioned

- **VPC**: Networking baseline (Subnets, IGW, Route Tables).
- **IAM Roles**: Execution roles for EKS, Fargate, and Application Pods.

## Usage

### Option 1: Standalone Deployment

If your team wants to deploy this as a standalone set of resources:

1. `terraform init`
2. `terraform apply`
3. Provide the output values (VPC ID, Subnet IDs, Role ARNs) to the Development team for their application deployment.

### Option 2: As a Terraform Module

You can include this folder in your existing Terraform repository as a module:

```hcl
module "testfest_infra" {
  source       = "./modules/testfest-infra" # Path to this folder
  aws_region   = "us-east-1"
  project_name = "testfest"
  vpc_cidr     = "10.0.0.0/16"
}
```
