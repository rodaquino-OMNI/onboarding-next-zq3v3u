# AWS WAF Configuration for AUSTA Integration Platform
# Provider version: hashicorp/aws ~> 4.0
# HIPAA-compliant web security controls with enhanced healthcare protection

# WAF Web ACL Configuration
resource "aws_wafv2_web_acl" "main" {
  name        = "austa-${var.environment}-waf"
  description = "WAF rules for AUSTA healthcare platform with HIPAA compliance"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # AWS Common Rule Set
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "AWSManagedRulesCommonRuleSetMetric"
      sampled_requests_enabled  = true
    }
  }

  # Healthcare-specific Rule Set
  rule {
    name     = "AWSManagedRulesHealthcareRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesHealthcareRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "AWSManagedRulesHealthcareRuleSetMetric"
      sampled_requests_enabled  = true
    }
  }

  # Rate Limiting Rule
  rule {
    name     = "RateBasedRule"
    priority = 3

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "RateBasedRuleMetric"
      sampled_requests_enabled  = true
    }
  }

  # Geo-blocking Rule (Allow only Brazil)
  rule {
    name     = "GeoBlockRule"
    priority = 4

    action {
      block {}
    }

    statement {
      not_statement {
        statement {
          geo_match_statement {
            country_codes = ["BR"]
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "GeoBlockRuleMetric"
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

# WAF Logging Configuration
resource "aws_wafv2_web_acl_logging_configuration" "main" {
  log_destination_configs = [aws_cloudwatch_log_group.waf.arn]
  resource_arn           = aws_wafv2_web_acl.main.arn

  redacted_fields {
    single_header {
      name = "authorization"
    }
  }

  redacted_fields {
    single_header {
      name = "x-api-key"
    }
  }

  redacted_fields {
    single_header {
      name = "cookie"
    }
  }
}

# CloudWatch Log Group for WAF Logs
resource "aws_cloudwatch_log_group" "waf" {
  name              = "/aws/waf/austa-${var.environment}"
  retention_in_days = 90

  tags = {
    Environment   = var.environment
    Service       = "WAF"
    ManagedBy     = "Terraform"
    Compliance    = "HIPAA"
    DataRetention = "90days"
  }
}

# Output WAF Web ACL ARN
output "web_acl_arn" {
  description = "ARN of the WAF Web ACL"
  value       = aws_wafv2_web_acl.main.arn
}

# Output WAF Web ACL ID
output "web_acl_id" {
  description = "ID of the WAF Web ACL"
  value       = aws_wafv2_web_acl.main.id
}