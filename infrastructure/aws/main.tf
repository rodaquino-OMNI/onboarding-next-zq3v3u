# Main Terraform configuration file for AUSTA Integration Platform AWS infrastructure
# Provider version: hashicorp/aws ~> 4.0
# Terraform version: >= 1.0

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }

  # S3 Backend configuration with enhanced security
  backend "s3" {
    bucket         = "${var.terraform_state_bucket}"
    key            = "${var.environment}/terraform.tfstate"
    region         = "${var.aws_region}"
    dynamodb_table = "${var.terraform_lock_table}"
    encrypt        = true
    kms_key_id     = "${var.terraform_kms_key_id}"
    acl            = "private"
    versioning     = true
    
    logging {
      target_bucket = "${var.terraform_log_bucket}"
      target_prefix = "terraform-state-logs/"
    }
  }
}

# AWS Provider configuration with security controls
provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project             = "AUSTA"
      ManagedBy          = "Terraform"
      Environment        = var.environment
      SecurityCompliance = "HIPAA-GDPR-LGPD"
      DataClassification = "PHI"
      BackupPolicy       = "Daily"
      CostCenter         = "Healthcare-IT"
    }
  }

  # Enhanced security configuration
  assume_role {
    role_arn     = var.terraform_role_arn
    session_name = "terraform-${var.environment}"
  }
  
  allowed_account_ids = [var.aws_account_id]
}

# Local variables for common configuration
locals {
  common_tags = {
    Project             = "AUSTA"
    ManagedBy          = "Terraform"
    Environment        = var.environment
    SecurityCompliance = "HIPAA-GDPR-LGPD"
    DataClassification = "PHI"
    BackupPolicy       = "Daily"
    CostCenter         = "Healthcare-IT"
  }

  # Environment-specific configurations
  is_production = var.environment == "production"
  
  # Region validation
  valid_regions = {
    production = ["us-east-1", "us-west-2"]
    staging    = ["us-east-2"]
  }
}

# Region validation
resource "null_resource" "region_validation" {
  lifecycle {
    precondition {
      condition     = contains(local.valid_regions[var.environment], var.aws_region)
      error_message = "Selected region is not allowed for ${var.environment} environment."
    }
  }
}

# VPC CIDR validation
resource "null_resource" "vpc_cidr_validation" {
  lifecycle {
    precondition {
      condition     = can(cidrhost(var.vpc_cidr, 0))
      error_message = "Invalid VPC CIDR block format."
    }
  }
}

# Output configurations
output "aws_region" {
  description = "The AWS region used for resource deployment"
  value       = var.aws_region
}

output "environment" {
  description = "The current deployment environment"
  value       = var.environment
}

# Data sources for AWS account information
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# KMS key for encryption
resource "aws_kms_key" "terraform_state" {
  description             = "KMS key for Terraform state encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  
  tags = merge(local.common_tags, {
    Name = "terraform-state-${var.environment}"
  })
}

# S3 bucket for Terraform state logging
resource "aws_s3_bucket" "terraform_logs" {
  bucket = var.terraform_log_bucket
  
  versioning {
    enabled = true
  }
  
  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        kms_master_key_id = aws_kms_key.terraform_state.arn
        sse_algorithm     = "aws:kms"
      }
    }
  }
  
  lifecycle_rule {
    enabled = true
    
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    
    expiration {
      days = 90
    }
  }
  
  tags = merge(local.common_tags, {
    Name = "terraform-logs-${var.environment}"
  })
}

# DynamoDB table for state locking
resource "aws_dynamodb_table" "terraform_lock" {
  name           = var.terraform_lock_table
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "LockID"
  
  attribute {
    name = "LockID"
    type = "S"
  }
  
  point_in_time_recovery {
    enabled = true
  }
  
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.terraform_state.arn
  }
  
  tags = merge(local.common_tags, {
    Name = "terraform-lock-${var.environment}"
  })
}