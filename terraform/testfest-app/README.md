# AWS Infrastructure - Application (Dev)

This folder contains the Terraform code for the application-specific resources.

**This code assumes that the baseline infrastructure (VPC, IAM) has already been provisioned by Ops.**

## Resources Provisioned

- **EKS**: Cluster and Fargate profiles.
- **RDS**: PostgreSQL database.
- **ECR**: Container registry.
- **S3**: Storage bucket.

## Usage

1. `terraform init`
2. Create a `terraform.tfvars` file. Use the values **outputted by the Ops group** after they run the `terraform/testfest-infra` module:

   ```hcl
   # These values come directly from the 'terraform/testfest-infra' outputs
   vpc_id                        = "vpc-xxxx"
   private_subnet_ids            = ["subnet-xxxx", "subnet-yyyy"]
   public_subnet_ids             = ["subnet-zzzz", "subnet-aaaa"]
   eks_cluster_role_arn          = "arn:aws:iam::xxx:role/..."
   fargate_pod_execution_role_arn = "arn:aws:iam::xxx:role/..."

   # You manage this one
   db_password                   = "yoursecurepassword"
   ```

3. `terraform apply`
