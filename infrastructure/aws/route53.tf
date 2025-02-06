# AWS Route53 DNS configuration for AUSTA Integration Platform
# Provider: hashicorp/aws ~> 4.0
# Purpose: Manage DNS records, health checks, and high availability routing

# Local variables for tagging and configuration
locals {
  common_tags = {
    Project     = "AUSTA"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  security_tags = {
    SecurityCompliance = "HIPAA-GDPR-LGPD"
    DataClassification = "PHI"
  }

  monitoring_tags = {
    Monitoring = "Enhanced"
    AlertGroup = "DNS-Health"
  }
}

# Primary hosted zone configuration with DNSSEC
resource "aws_route53_zone" "main" {
  name    = var.domain_name
  comment = "AUSTA Integration Platform DNS Zone with DNSSEC"
  
  # VPC association for private DNS
  vpc {
    vpc_id     = var.vpc_id
    vpc_region = var.aws_region
  }

  # DNSSEC configuration
  dynamic "dnssec_config" {
    for_each = var.enable_dnssec ? [1] : []
    content {
      signing_status = "SIGNING"
      signing_algorithm = "ECDSAP256SHA256"
    }
  }

  force_destroy = false
  tags = merge(local.common_tags, local.security_tags)
}

# Primary health check for application endpoint
resource "aws_route53_health_check" "primary" {
  count = var.enable_health_check ? 1 : 0

  fqdn              = var.app_endpoint
  port              = 443
  type              = "HTTPS"
  resource_path     = var.health_check_path
  failure_threshold = 3
  request_interval  = 30
  
  # Multi-region health checking
  regions = [
    "us-east-1",
    "eu-west-1",
    "ap-southeast-1"
  ]

  search_string       = "OK"
  measure_latency     = true
  invert_healthcheck  = false
  disabled           = false
  enable_sni         = true

  # Advanced health check configuration
  child_healthchecks    = var.secondary_health_checks
  child_health_threshold = 2

  tags = merge(local.common_tags, local.monitoring_tags)
}

# Primary A record with weighted routing
resource "aws_route53_record" "primary" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.app_subdomain
  type    = "A"

  set_identifier = "primary"
  health_check_id = var.enable_health_check ? aws_route53_health_check.primary[0].id : null

  weighted_routing_policy {
    weight = 90
  }

  alias {
    name                   = var.app_endpoint
    zone_id               = var.endpoint_zone_id
    evaluate_target_health = true
  }
}

# Secondary A record for DR with weighted routing
resource "aws_route53_record" "secondary" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.app_subdomain
  type    = "A"

  set_identifier = "secondary"
  health_check_id = var.enable_health_check ? aws_route53_health_check.primary[0].id : null

  weighted_routing_policy {
    weight = 10
  }

  alias {
    name                   = "${var.app_subdomain}-dr.${var.domain_name}"
    zone_id               = aws_route53_zone.main.zone_id
    evaluate_target_health = true
  }
}

# DNS query logging configuration
resource "aws_route53_query_log" "main" {
  count = var.enable_query_logging ? 1 : 0

  depends_on = [aws_cloudwatch_log_resource_policy.route53_query_logging]

  zone_id                  = aws_route53_zone.main.zone_id
  cloudwatch_log_group_arn = aws_cloudwatch_log_group.dns_logs[0].arn
}

# CloudWatch log group for DNS query logging
resource "aws_cloudwatch_log_group" "dns_logs" {
  count = var.enable_query_logging ? 1 : 0

  name              = "/aws/route53/${var.domain_name}/queries"
  retention_in_days = 30
  kms_key_id        = var.kms_key_arn

  tags = merge(local.common_tags, {
    Name = "route53-query-logs"
  })
}

# IAM policy for Route53 query logging
resource "aws_cloudwatch_log_resource_policy" "route53_query_logging" {
  count = var.enable_query_logging ? 1 : 0

  policy_name = "route53-query-logging-policy"

  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "route53.amazonaws.com"
        }
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.dns_logs[0].arn}:*"
      }
    ]
  })
}

# Outputs for DNS configuration
output "route53_zone_id" {
  description = "The hosted zone ID"
  value       = aws_route53_zone.main.zone_id
}

output "route53_name_servers" {
  description = "The name servers for the hosted zone"
  value       = aws_route53_zone.main.name_servers
}

output "route53_dnssec_status" {
  description = "The DNSSEC signing status"
  value       = var.enable_dnssec ? aws_route53_zone.main.dnssec_config[0].signing_status : "DISABLED"
}