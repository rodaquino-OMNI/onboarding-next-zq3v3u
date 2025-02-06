# AWS SES Configuration for AUSTA Integration Platform
# Provider version: hashicorp/aws ~> 4.0

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# Local variables for SES configuration
locals {
  project_name = "austa"
  ses_domain   = "${local.project_name}.${var.environment}.com"
  ses_email_from = "no-reply@${local.ses_domain}"
  common_tags = {
    Project     = local.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# SES Domain Identity Configuration
resource "aws_ses_domain_identity" "main" {
  domain = local.ses_domain
  
  tags = merge(local.common_tags, {
    Name = "${local.project_name}-ses-domain"
  })

  lifecycle {
    prevent_destroy = true
  }
}

# SES DKIM Configuration
resource "aws_ses_domain_dkim" "main" {
  domain = aws_ses_domain_identity.main.domain

  depends_on = [aws_ses_domain_identity.main]
}

# System Email Identity Configuration
resource "aws_ses_email_identity" "system" {
  email = local.ses_email_from

  tags = merge(local.common_tags, {
    Name = "${local.project_name}-ses-email"
  })

  lifecycle {
    prevent_destroy = true
  }
}

# SES Configuration Set with Enhanced Features
resource "aws_ses_configuration_set" "main" {
  name                       = "${local.project_name}-${var.environment}-config-set"
  reputation_metrics_enabled = true
  sending_enabled           = true

  delivery_options {
    tls_policy        = "REQUIRE"
    sending_pool_name = "${local.project_name}-pool"
  }

  tracking_options {
    custom_redirect_domain = local.ses_domain
  }

  tags = merge(local.common_tags, {
    Name = "${local.project_name}-ses-config"
  })
}

# SES Event Destination for CloudWatch
resource "aws_ses_event_destination" "cloudwatch" {
  name                   = "${local.project_name}-${var.environment}-events"
  configuration_set_name = aws_ses_configuration_set.main.name
  enabled                = true
  matching_types         = ["send", "reject", "bounce", "complaint", "delivery"]

  cloudwatch_destination {
    default_value  = "default"
    dimension_name = "ses_events"
    value_source   = "messageTag"
  }
}

# SES Receipt Rule Set
resource "aws_ses_receipt_rule_set" "main" {
  rule_set_name = "${local.project_name}-${var.environment}-rules"
}

# SES Receipt Rule for Incoming Emails
resource "aws_ses_receipt_rule" "main" {
  name          = "${local.project_name}-${var.environment}-rule"
  rule_set_name = aws_ses_receipt_rule_set.main.rule_set_name
  enabled       = true
  scan_enabled  = true

  recipients = [local.ses_domain]

  sns_action {
    position  = 1
    topic_arn = aws_sns_topic.ses_notifications.arn
  }

  depends_on = [aws_ses_receipt_rule_set.main]
}

# SNS Topic for SES Notifications
resource "aws_sns_topic" "ses_notifications" {
  name = "${local.project_name}-${var.environment}-ses-notifications"

  tags = merge(local.common_tags, {
    Name = "${local.project_name}-ses-notifications"
  })
}

# SES Identity Policy
resource "aws_ses_identity_policy" "main" {
  identity = aws_ses_domain_identity.main.arn
  name     = "${local.project_name}-${var.environment}-policy"
  policy   = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = "*"
        }
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail"
        ]
        Resource = aws_ses_domain_identity.main.arn
        Condition = {
          StringEquals = {
            "aws:PrincipalOrgID": data.aws_organizations_organization.current.id
          }
        }
      }
    ]
  })
}

# Data source for AWS Organization ID
data "aws_organizations_organization" "current" {}

# Output values for other modules
output "ses_domain_identity_arn" {
  value       = aws_ses_domain_identity.main.arn
  description = "ARN of the SES domain identity"
}

output "ses_configuration_set_name" {
  value       = aws_ses_configuration_set.main.name
  description = "Name of the SES configuration set"
}

output "ses_verification_token" {
  value       = aws_ses_domain_identity.main.verification_token
  description = "Domain verification token for DNS configuration"
  sensitive   = true
}

output "ses_dkim_tokens" {
  value       = aws_ses_domain_dkim.main.dkim_tokens
  description = "DKIM tokens for DNS configuration"
  sensitive   = true
}