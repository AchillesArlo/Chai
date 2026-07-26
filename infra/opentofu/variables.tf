variable "environment" {
  type        = string
  description = "Deployment environment name"
  default     = "local"

  validation {
    condition     = contains(["local", "test", "staging", "production"], var.environment)
    error_message = "environment must be local|test|staging|production."
  }
}

variable "region" {
  type        = string
  description = "Primary region (informational until cloud provider is wired)"
  default     = "ap-southeast-1"
}
