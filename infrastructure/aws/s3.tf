# S3 configuration for AUSTA Integration Platform
# Provider version: hashicorp/aws ~> 4.0
# Implements HIPAA-compliant storage with encryption and lifecycle management

# Primary document storage bucket
resource "aws_s3_bucket" "documents" {
  bucket = "austa-${var.environment}-documents"

  tags = {
    Name        = "austa-${var.environment}-documents"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Compliance  = "HIPAA"
  }
}

# Bucket for access logs
resource "aws_s3_bucket" "logs" {
  bucket = "austa-${var.environment}-logs"

  tags = {
    Name        = "austa-${var.environment}-logs"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Compliance  = "HIPAA"
  }
}

# Replica bucket for cross-region replication
resource "aws_s3_bucket" "replica" {
  provider = aws.dr
  bucket   = "austa-${var.environment}-documents-replica"

  tags = {
    Name        = "austa-${var.environment}-documents-replica"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Compliance  = "HIPAA"
  }
}

# Versioning configuration for documents bucket
resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption configuration
resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.s3.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# Lifecycle rules for cost optimization
resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    id     = "transition_to_ia"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "GLACIER"
    }

    expiration {
      expired_object_delete_marker = true
    }
  }
}

# Access logging configuration
resource "aws_s3_bucket_logging" "documents" {
  bucket = aws_s3_bucket.documents.id

  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "s3-access-logs/"
}

# Block public access
resource "aws_s3_bucket_public_access_block" "documents" {
  bucket = aws_s3_bucket.documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CORS configuration
resource "aws_s3_bucket_cors_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = ["https://*.austa.health"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Bucket policy
resource "aws_s3_bucket_policy" "documents" {
  bucket = aws_s3_bucket.documents.id
  policy = data.aws_iam_policy_document.bucket_policy.json
}

# Generate bucket policy
data "aws_iam_policy_document" "bucket_policy" {
  statement {
    sid    = "EnforceSSLOnly"
    effect = "Deny"
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.documents.arn,
      "${aws_s3_bucket.documents.arn}/*"
    ]
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid    = "AllowApplicationAccess"
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = ["${data.aws_caller_identity.current.account_id}"]
    }
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:ListBucket"
    ]
    resources = [
      aws_s3_bucket.documents.arn,
      "${aws_s3_bucket.documents.arn}/*"
    ]
    condition {
      test     = "StringEquals"
      variable = "aws:PrincipalTag/Environment"
      values   = [var.environment]
    }
  }
}

# Replication role
resource "aws_iam_role" "replication" {
  name = "austa-${var.environment}-s3-replication"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
      }
    ]
  })
}

# Replication configuration
resource "aws_s3_bucket_replication_configuration" "documents" {
  depends_on = [aws_s3_bucket_versioning.documents]

  role   = aws_iam_role.replication.arn
  bucket = aws_s3_bucket.documents.id

  rule {
    id     = "DocumentsReplication"
    status = "Enabled"

    destination {
      bucket        = aws_s3_bucket.replica.arn
      storage_class = "STANDARD_IA"
    }
  }
}

# Outputs
output "documents_bucket_id" {
  description = "ID of the documents S3 bucket"
  value       = aws_s3_bucket.documents.id
}

output "documents_bucket_arn" {
  description = "ARN of the documents S3 bucket"
  value       = aws_s3_bucket.documents.arn
}

# Data source for current AWS account
data "aws_caller_identity" "current" {}