# AWS KMS configuration for AUSTA Integration Platform
# Provider version: hashicorp/aws ~> 4.0
# Implements AES-256-GCM encryption with 90-day key rotation for HIPAA compliance

# KMS key for RDS encryption
resource "aws_kms_key" "rds" {
  description             = "KMS key for RDS database encryption in ${var.environment}"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  policy                 = data.aws_iam_policy_document.kms_key_policy.json

  tags = {
    Name            = "austa-${var.environment}-rds-kms-key"
    Environment     = var.environment
    ManagedBy       = "Terraform"
    SecurityLevel   = "HIPAA-Compliant"
    RotationPeriod  = "90-days"
    EncryptionType  = "AES-256-GCM"
  }
}

# KMS key for S3 bucket encryption
resource "aws_kms_key" "s3" {
  description             = "KMS key for S3 document storage encryption in ${var.environment}"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  policy                 = data.aws_iam_policy_document.kms_key_policy.json

  tags = {
    Name            = "austa-${var.environment}-s3-kms-key"
    Environment     = var.environment
    ManagedBy       = "Terraform"
    SecurityLevel   = "HIPAA-Compliant"
    RotationPeriod  = "90-days"
    EncryptionType  = "AES-256-GCM"
  }
}

# KMS key for Secrets Manager
resource "aws_kms_key" "secrets" {
  description             = "KMS key for Secrets Manager encryption in ${var.environment}"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  policy                 = data.aws_iam_policy_document.kms_key_policy.json

  tags = {
    Name            = "austa-${var.environment}-secrets-kms-key"
    Environment     = var.environment
    ManagedBy       = "Terraform"
    SecurityLevel   = "HIPAA-Compliant"
    RotationPeriod  = "90-days"
    EncryptionType  = "AES-256-GCM"
  }
}

# KMS key policy document
data "aws_iam_policy_document" "kms_key_policy" {
  statement {
    sid    = "EnableIAMUserPermissions"
    effect = "Allow"
    principals {
      type = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
    actions = ["kms:*"]
    resources = ["*"]
  }

  statement {
    sid    = "AllowServiceRoleAccess"
    effect = "Allow"
    principals {
      type = "AWS"
      identifiers = [
        "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-service-role/rds.amazonaws.com/AWSServiceRoleForRDS",
        "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-service-role/s3.amazonaws.com/AWSServiceRoleForS3",
        "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-service-role/secretsmanager.amazonaws.com/AWSServiceRoleForSecretsManager"
      ]
    }
    actions = [
      "kms:Decrypt",
      "kms:DescribeKey",
      "kms:Encrypt",
      "kms:GenerateDataKey*",
      "kms:ReEncrypt*"
    ]
    resources = ["*"]
  }

  statement {
    sid    = "AllowCloudWatchLogs"
    effect = "Allow"
    principals {
      type = "Service"
      identifiers = ["logs.${var.aws_region}.amazonaws.com"]
    }
    actions = [
      "kms:Encrypt",
      "kms:Decrypt",
      "kms:ReEncrypt*",
      "kms:GenerateDataKey*",
      "kms:DescribeKey"
    ]
    resources = ["*"]
  }
}

# Data source for AWS account ID
data "aws_caller_identity" "current" {}

# KMS key aliases
resource "aws_kms_alias" "rds" {
  name          = "alias/austa-${var.environment}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

resource "aws_kms_alias" "s3" {
  name          = "alias/austa-${var.environment}-s3"
  target_key_id = aws_kms_key.s3.key_id
}

resource "aws_kms_alias" "secrets" {
  name          = "alias/austa-${var.environment}-secrets"
  target_key_id = aws_kms_key.secrets.key_id
}

# Output values for use in other modules
output "rds_kms_key_id" {
  description = "KMS key ID for RDS encryption"
  value       = aws_kms_key.rds.key_id
}

output "s3_kms_key_id" {
  description = "KMS key ID for S3 bucket encryption"
  value       = aws_kms_key.s3.key_id
}

output "secrets_kms_key_id" {
  description = "KMS key ID for Secrets Manager encryption"
  value       = aws_kms_key.secrets.key_id
}