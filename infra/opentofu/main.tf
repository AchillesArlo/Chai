# Stage 1 pilot skeleton — no live resources until cloud project is provisioned.
# ponytail: real modules land when staging account exists; plan/apply stay blocked.

terraform {
  required_version = ">= 1.8.0"

  required_providers {
    # Placeholder only. Swap for the cloud provider when pilot infra is provisioned.
    null = {
      source  = "hashicorp/null"
      version = "3.2.3"
    }
  }
}

locals {
  project     = "chai-platform"
  environment = var.environment
  labels = {
    app         = "chai"
    environment = var.environment
    stage       = "1"
  }
}

resource "null_resource" "pilot_gate_marker" {
  triggers = {
    environment = var.environment
    project     = local.project
  }
}
