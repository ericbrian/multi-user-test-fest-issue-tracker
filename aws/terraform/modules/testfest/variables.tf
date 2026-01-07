variable "name" {
  description = "Name prefix for Test Fest resources"
  type        = string
}

variable "tags" {
  description = "Tags applied to created resources"
  type        = map(string)
  default     = {}
}
