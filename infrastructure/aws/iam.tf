# AWS IAM configuration for AUSTA Integration Platform
# Provider version: hashicorp/aws ~> 4.0
# Implements zero-trust security model with least-privilege access

# ECS Task Execution Role
resource "aws_iam_role" "ecs_execution" {
  name = "austa-${var.environment}-ecs-execution"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
      Condition = {
        StringEquals = {
          "aws:SourceAccount": data.aws_caller_identity.current.account_id
        }
      }
    }]
  })

  tags = {
    Name        = "austa-${var.environment}-ecs-execution"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Compliance  = "HIPAA"
  }
}

# ECS Task Role
resource "aws_iam_role" "ecs_task" {
  name = "austa-${var.environment}-ecs-task"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
      Condition = {
        StringEquals = {
          "aws:SourceAccount": data.aws_caller_identity.current.account_id
        }
        Bool = {
          "aws:SecureTransport": "true"
        }
      }
    }]
  })

  tags = {
    Name        = "austa-${var.environment}-ecs-task"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Compliance  = "HIPAA"
  }
}

# S3 Access Policy
resource "aws_iam_policy" "s3_access" {
  name        = "austa-${var.environment}-s3-access"
  description = "Policy for secure S3 document access with encryption requirements"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.documents.arn,
          "${aws_s3_bucket.documents.arn}/*"
        ]
        Condition = {
          StringEquals = {
            "s3:x-amz-server-side-encryption": "aws:kms",
            "s3:x-amz-server-side-encryption-aws-kms-key-id": aws_kms_key.s3.arn
          }
          Bool = {
            "aws:SecureTransport": "true"
          }
        }
      }
    ]
  })
}

# ECS Task Execution Policy
resource "aws_iam_role_policy" "ecs_execution" {
  name = "austa-${var.environment}-ecs-execution-policy"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ]
        Resource = "*"
        Condition = {
          Bool = {
            "aws:SecureTransport": "true"
          }
        }
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:${data.aws_caller_identity.current.account_id}:log-group:/aws/ecs/austa-${var.environment}*"
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = [
          aws_kms_key.secrets.arn
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport": "true"
          }
        }
      }
    ]
  })
}

# ECS Task Role Policy
resource "aws_iam_role_policy" "ecs_task" {
  name = "austa-${var.environment}-ecs-task-policy"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "ses:FromAddress": "*.austa.health"
          }
          Bool = {
            "aws:SecureTransport": "true"
          }
        }
      },
      {
        Effect = "Allow"
        Action = [
          "textract:AnalyzeDocument",
          "textract:DetectDocumentText",
          "textract:GetDocumentAnalysis",
          "textract:StartDocumentAnalysis"
        ]
        Resource = "*"
        Condition = {
          Bool = {
            "aws:SecureTransport": "true"
          }
        }
      }
    ]
  })
}

# Attach AWS managed policy for ECS task execution
resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Attach S3 access policy to ECS task role
resource "aws_iam_role_policy_attachment" "ecs_task_s3" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.s3_access.arn
}

# Data source for current AWS account
data "aws_caller_identity" "current" {}

# Outputs
output "ecs_execution_role_arn" {
  description = "ARN of ECS task execution role"
  value       = aws_iam_role.ecs_execution.arn
}

output "ecs_task_role_arn" {
  description = "ARN of ECS task role"
  value       = aws_iam_role.ecs_task.arn
}

output "s3_access_policy_arn" {
  description = "ARN of S3 access policy"
  value       = aws_iam_policy.s3_access.arn
}