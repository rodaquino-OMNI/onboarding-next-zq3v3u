# Terraform variables configuration file for AUSTA Integration Platform AWS infrastructure
# Version: 1.0
# Provider version: hashicorp/terraform ~> 1.0

# Region Configuration
variable "aws_region" {
  type        = string
  description = "Primary AWS region for resource deployment"
  default     = "us-east-1"
}

# Environment Configuration
variable "environment" {
  type        = string
  description = "Deployment environment identifier"
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be either 'staging' or 'production'."
  }
}

# Network Configuration
variable "vpc_cidr" {
  type        = string
  description = "CIDR block for VPC network configuration"
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  type        = list(string)
  description = "List of availability zones for multi-AZ deployment"
}

# Database Configuration
variable "rds_instance_class" {
  type        = string
  description = "RDS instance type for database servers"
  default     = "db.t3.medium"
}

# ECS Configuration
variable "ecs_cluster_name" {
  type        = string
  description = "Name for the ECS cluster"
}

variable "ecs_container_memory" {
  type        = number
  description = "Memory allocation for ECS containers in MiB"
  default     = 2048
}

variable "ecs_container_cpu" {
  type        = number
  description = "CPU allocation for ECS containers (1024 = 1 vCPU)"
  default     = 1024
}

# Domain Configuration
variable "domain_name" {
  type        = string
  description = "Domain name for Route53 and ACM certificate"
}

# Security Configuration
variable "enable_waf" {
  type        = bool
  description = "Flag to enable WAF protection"
  default     = true
}

# Backup Configuration
variable "backup_retention_days" {
  type        = number
  description = "Number of days to retain backups"
  default     = 30
  validation {
    condition     = var.backup_retention_days >= 7
    error_message = "Backup retention must be at least 7 days for compliance."
  }
}

# Auto Scaling Configuration
variable "min_capacity" {
  type        = number
  description = "Minimum number of ECS tasks"
  default     = 2
}

variable "max_capacity" {
  type        = number
  description = "Maximum number of ECS tasks"
  default     = 10
}

# Monitoring Configuration
variable "enable_enhanced_monitoring" {
  type        = bool
  description = "Enable enhanced monitoring for RDS instances"
  default     = true
}

# KMS Configuration
variable "enable_encryption" {
  type        = bool
  description = "Enable KMS encryption for sensitive data"
  default     = true
}

# S3 Configuration
variable "s3_versioning" {
  type        = bool
  description = "Enable versioning for S3 buckets"
  default     = true
}

# Redis Configuration
variable "elasticache_node_type" {
  type        = string
  description = "ElastiCache node type"
  default     = "cache.t3.medium"
}

# Load Balancer Configuration
variable "ssl_policy" {
  type        = string
  description = "SSL policy for ALB HTTPS listeners"
  default     = "ELBSecurityPolicy-TLS-1-2-2017-01"
}

# Tags Configuration
variable "tags" {
  type        = map(string)
  description = "Common tags for all resources"
  default     = {}
}