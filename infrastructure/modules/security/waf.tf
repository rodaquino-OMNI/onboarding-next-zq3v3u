# AWS WAF v2 configuration for AUSTA Integration Platform
# Provider version: hashicorp/aws ~> 4.0
# Implements healthcare-specific security controls and HIPAA compliance requirements

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# WAF Web ACL Configuration
resource "aws_wafv2_web_acl" "main" {
  name        = "austa-${var.environment}-waf"
  description = "WAF rules for AUSTA healthcare platform with HIPAA compliance"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # AWS Managed Rule Groups
  rule {
    name     = "AWS-CommonRules"
    priority = 10

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "AWSCommonRulesMetric"
      sampled_requests_enabled  = true
    }
  }

  rule {
    name     = "AWS-KnownBadInputs"
    priority = 20

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "AWSKnownBadInputsMetric"
      sampled_requests_enabled  = true
    }
  }

  rule {
    name     = "AWS-SQLiRules"
    priority = 30

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "AWSSQLiRulesMetric"
      sampled_requests_enabled  = true
    }
  }

  # Rate Limiting Rule
  rule {
    name     = "RateLimit"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.waf_rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "RateLimitMetric"
      sampled_requests_enabled  = true
    }
  }

  # Geo-blocking Rule (Allow only Brazil)
  rule {
    name     = "GeoBlock"
    priority = 2

    action {
      block {}
    }

    statement {
      geo_match_statement {
        country_codes = ["BR"]
        negated      = true
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "GeoBlockMetric"
      sampled_requests_enabled  = true
    }
  }

  # Healthcare Sensitive Data Protection Rule
  rule {
    name     = "HealthcareSensitiveData"
    priority = 3

    action {
      block {}
    }

    statement {
      regex_pattern_set_reference_statement {
        arn = aws_wafv2_regex_pattern_set.phi_patterns.arn
        field_to_match {
          body {}
        }
        text_transformation {
          priority = 1
          type     = "NONE"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "HealthcareSensitiveDataMetric"
      sampled_requests_enabled  = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name               = "AUSTAWAFMetrics"
    sampled_requests_enabled  = true
  }

  tags = {
    Environment = var.environment
    Service     = "WAF"
    ManagedBy   = "Terraform"
    Compliance  = "HIPAA"
  }
}

# PHI Data Pattern Set
resource "aws_wafv2_regex_pattern_set" "phi_patterns" {
  name        = "phi-patterns-${var.environment}"
  description = "Regex patterns for detecting PHI data"
  scope       = "REGIONAL"

  regular_expression {
    regex_string = "\\b\\d{3}-\\d{2}-\\d{4}\\b" # SSN pattern
  }

  regular_expression {
    regex_string = "\\b\\d{10}\\b" # Medical record number pattern
  }

  tags = {
    Environment = var.environment
    Service     = "WAF"
    ManagedBy   = "Terraform"
    Compliance  = "HIPAA"
  }
}

# WAF Logging Configuration
resource "aws_wafv2_web_acl_logging_configuration" "main" {
  log_destination_configs = [aws_cloudwatch_log_group.waf.arn]
  resource_arn           = aws_wafv2_web_acl.main.arn

  redacted_fields {
    single_header {
      name = "authorization"
    }
    single_header {
      name = "x-api-key"
    }
    single_header {
      name = "cookie"
    }
  }
}

# CloudWatch Log Group for WAF Logs
resource "aws_cloudwatch_log_group" "waf" {
  name              = "/aws/waf/austa-${var.environment}"
  retention_in_days = 90
  kms_key_id        = var.kms_key_arn

  tags = {
    Environment = var.environment
    Service     = "WAF"
    ManagedBy   = "Terraform"
    Compliance  = "HIPAA"
  }
}

# Variables
variable "kms_key_arn" {
  type        = string
  description = "ARN of KMS key for encrypting WAF logs"
}

variable "waf_rate_limit" {
  type        = number
  description = "Rate limit for API requests per IP"
  default     = 2000
}

# Outputs
output "web_acl_arn" {
  value       = aws_wafv2_web_acl.main.arn
  description = "ARN of created WAF web ACL for resource association"
}

output "web_acl_id" {
  value       = aws_wafv2_web_acl.main.id
  description = "ID of created WAF web ACL for reference"
}