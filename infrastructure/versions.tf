# AUSTA Integration Platform - Infrastructure Version Constraints
# Provider versions:
# - hashicorp/aws: ~> 4.0
# - hashicorp/google: ~> 4.0
# - hashicorp/google-beta: ~> 4.0
# - hashicorp/random: ~> 3.0

terraform {
  # Terraform version constraint based on technical requirements
  required_version = ">= 1.0"

  # Provider version constraints for multi-cloud infrastructure
  required_providers {
    # AWS provider for primary infrastructure
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }

    # GCP provider for disaster recovery infrastructure
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }

    # GCP Beta provider for advanced features
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 4.0"
    }

    # Random provider for resource naming
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}