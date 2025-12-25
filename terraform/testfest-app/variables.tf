variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "testfest"
}

variable "db_password" {
  description = "RDS root password"
  type        = string
  sensitive   = true
}

# Network and IAM inputs from Ops
variable "vpc_id" {
  description = "VPC ID from Ops"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private Subnet IDs from Ops"
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "Public Subnet IDs from Ops"
  type        = list(string)
}

variable "eks_cluster_role_arn" {
  description = "EKS Cluster Role ARN from Ops"
  type        = string
}

variable "fargate_pod_execution_role_arn" {
  description = "Fargate Pod Execution Role ARN from Ops"
  type        = string
}
