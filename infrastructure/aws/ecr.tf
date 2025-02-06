# AWS ECR Configuration for AUSTA Integration Platform
# Provider version: hashicorp/aws ~> 4.0

# Data source to get AWS account ID for policies
data "aws_caller_identity" "current" {}

# Local variables for repository configuration
locals {
  repository_names = ["austa-api", "austa-worker", "austa-scheduler", "austa-web"]
  common_tags = {
    Environment         = var.environment
    Project            = "AUSTA"
    ManagedBy          = "Terraform"
    SecurityCompliance = "HIPAA"
    DataClassification = "Confidential"
  }
}

# KMS key for ECR encryption
resource "aws_kms_key" "ecr_key" {
  description             = "KMS key for ECR repository encryption"
  deletion_window_in_days = 7
  enable_key_rotation    = true
  
  tags = local.common_tags
}

resource "aws_kms_alias" "ecr_key_alias" {
  name          = "alias/austa-ecr-key"
  target_key_id = aws_kms_key.ecr_key.key_id
}

# ECR repositories creation
resource "aws_ecr_repository" "repositories" {
  for_each = toset(local.repository_names)

  name                 = each.key
  image_tag_mutability = "IMMUTABLE"

  encryption_configuration {
    encryption_type = "KMS"
    kms_key        = aws_kms_key.ecr_key.arn
  }

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = local.common_tags
}

# ECR lifecycle policies
resource "aws_ecr_lifecycle_policy" "lifecycle_policies" {
  for_each = aws_ecr_repository.repositories

  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 30 production images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["prod"]
          countType     = "imageCountMoreThan"
          countNumber   = 30
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Keep last 10 staging images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["staging"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 3
        description  = "Remove untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# ECR repository policies
resource "aws_ecr_repository_policy" "repository_policies" {
  for_each = aws_ecr_repository.repositories

  repository = each.value.name
  policy     = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowPullPush"
        Effect = "Allow"
        Principal = {
          AWS = [
            "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/AustaCICD",
            "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/AustaECS"
          ]
        }
        Action = [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload"
        ]
      }
    ]
  })
}

# Public repository scanning rules
resource "aws_ecr_registry_scanning_configuration" "scanning" {
  scan_type = "ENHANCED"

  rule {
    scan_frequency = "CONTINUOUS_SCAN"
    repository_filter {
      filter      = "*"
      filter_type = "WILDCARD"
    }
  }
}

# Cross-region replication configuration
resource "aws_ecr_replication_configuration" "replication" {
  replication_configuration {
    rule {
      destination {
        region      = "us-west-2"  # DR region
        registry_id = data.aws_caller_identity.current.account_id
      }
    }
  }
}

# Output values for other modules
output "repository_urls" {
  description = "Map of repository names to repository URLs"
  value = {
    for name, repo in aws_ecr_repository.repositories : name => repo.repository_url
  }
}

output "repository_arns" {
  description = "Map of repository names to repository ARNs"
  value = {
    for name, repo in aws_ecr_repository.repositories : name => repo.arn
  }
}