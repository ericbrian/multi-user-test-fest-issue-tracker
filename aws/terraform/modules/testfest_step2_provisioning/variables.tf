variable "name" {
  description = "Name prefix for Test Fest resources"
  type        = string
}

variable "tags" {
  description = "Tags applied to created resources"
  type        = map(string)
  default     = {}
}

# NOTE: Intentionally minimal placeholder variables.
# In the protected repo, add your org-standard EKS/RDS/ECR/S3 inputs here.
