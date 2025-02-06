# AWS CloudWatch configuration for AUSTA Integration Platform
# Provider: hashicorp/aws ~> 4.0
# Implements comprehensive monitoring for application metrics, infrastructure metrics, and business metrics

locals {
  log_retention_days = 30
  metric_namespace = "AUSTA/Platform"
  alarm_evaluation_periods = 3
  alarm_period_seconds = 300
  high_resolution_metrics = true
  log_encryption_enabled = true
}

# Log Groups with HIPAA-compliant encryption
resource "aws_cloudwatch_log_group" "api_logs" {
  name              = "/aws/ecs/austa-api"
  retention_in_days = local.log_retention_days
  kms_key_id        = var.kms_key_arn
  
  tags = {
    Environment = var.environment
    Service     = "API"
    Compliance  = "HIPAA"
  }
}

resource "aws_cloudwatch_log_group" "worker_logs" {
  name              = "/aws/ecs/austa-workers"
  retention_in_days = local.log_retention_days
  kms_key_id        = var.kms_key_arn
  
  tags = {
    Environment = var.environment
    Service     = "Workers"
    Compliance  = "HIPAA"
  }
}

resource "aws_cloudwatch_log_group" "enrollment_logs" {
  name              = "/aws/ecs/austa-enrollment"
  retention_in_days = local.log_retention_days
  kms_key_id        = var.kms_key_arn
  
  tags = {
    Environment = var.environment
    Service     = "Enrollment"
    Compliance  = "HIPAA"
  }
}

# Performance and SLA Alarms
resource "aws_cloudwatch_metric_alarm" "api_response_time" {
  alarm_name          = "api-p95-response-time"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = local.alarm_evaluation_periods
  metric_name         = "p95_response_time"
  namespace           = local.metric_namespace
  period             = local.alarm_period_seconds
  statistic          = "Average"
  threshold          = 1.0 # 1 second threshold for P95 latency
  alarm_description  = "P95 API response time exceeds 1 second"
  alarm_actions      = [var.sns_alert_topic_arn]
  ok_actions         = [var.sns_alert_topic_arn]
  
  dimensions = {
    Service     = "API"
    Environment = var.environment
  }
}

resource "aws_cloudwatch_metric_alarm" "api_error_rate" {
  alarm_name          = "api-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = local.alarm_evaluation_periods
  metric_name         = "error_rate"
  namespace           = local.metric_namespace
  period             = local.alarm_period_seconds
  statistic          = "Average"
  threshold          = 0.01 # 1% error rate threshold
  alarm_description  = "API error rate exceeds 1%"
  alarm_actions      = [var.sns_alert_topic_arn]
  ok_actions         = [var.sns_alert_topic_arn]
  
  dimensions = {
    Service     = "API"
    Environment = var.environment
  }
}

# Business Metrics Alarms
resource "aws_cloudwatch_metric_alarm" "enrollment_completion_rate" {
  alarm_name          = "enrollment-completion-rate"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = local.alarm_evaluation_periods
  metric_name         = "enrollment_completion_rate"
  namespace           = local.metric_namespace
  period             = local.alarm_period_seconds
  statistic          = "Average"
  threshold          = 0.90 # 90% completion rate threshold
  alarm_description  = "Enrollment completion rate below 90%"
  alarm_actions      = [var.sns_alert_topic_arn]
  
  dimensions = {
    Service     = "Enrollment"
    Environment = var.environment
  }
}

# Comprehensive Monitoring Dashboard
resource "aws_cloudwatch_dashboard" "platform_dashboard" {
  dashboard_name = "austa-platform-${var.environment}"
  
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          metrics = [
            [local.metric_namespace, "p95_response_time"],
            [local.metric_namespace, "error_rate"]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "API Performance"
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ECS", "CPUUtilization"],
            ["AWS/ECS", "MemoryUtilization"]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "Container Resources"
        }
      },
      {
        type = "log"
        properties = {
          query   = "fields @timestamp, @message | filter @message like /ERROR/"
          region  = var.aws_region
          title   = "Error Logs"
          view    = "table"
        }
      }
    ]
  })
}

# Metric Filter for Error Tracking
resource "aws_cloudwatch_log_metric_filter" "error_logs" {
  name           = "error-logs"
  pattern        = "ERROR"
  log_group_name = aws_cloudwatch_log_group.api_logs.name

  metric_transformation {
    name          = "error_count"
    namespace     = local.metric_namespace
    value         = "1"
    default_value = 0
  }
}

# Variables
variable "environment" {
  type        = string
  description = "Environment name (staging/production)"
}

variable "aws_region" {
  type        = string
  description = "AWS region for resources"
}

variable "kms_key_arn" {
  type        = string
  description = "KMS key ARN for log encryption"
}

variable "sns_alert_topic_arn" {
  type        = string
  description = "SNS topic ARN for alarm notifications"
}

# Outputs
output "log_group_names" {
  description = "Names of created CloudWatch log groups"
  value = {
    api        = aws_cloudwatch_log_group.api_logs.name
    workers    = aws_cloudwatch_log_group.worker_logs.name
    enrollment = aws_cloudwatch_log_group.enrollment_logs.name
  }
}

output "dashboard_name" {
  description = "Name of the CloudWatch dashboard"
  value       = aws_cloudwatch_dashboard.platform_dashboard.dashboard_name
}