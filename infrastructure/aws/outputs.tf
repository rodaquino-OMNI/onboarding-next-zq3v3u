# AWS Infrastructure Outputs for AUSTA Integration Platform
# Provider version: hashicorp/terraform ~> 1.0

# VPC Outputs
output "vpc_id" {
  description = "ID of the VPC for network integration"
  value       = aws_vpc.main.id
  sensitive   = false
}

output "private_subnets" {
  description = "List of private subnet IDs for secure resource deployment"
  value       = aws_vpc.main.private_subnets
  sensitive   = false
}

output "availability_zones" {
  description = "List of availability zones for high availability deployment"
  value       = aws_vpc.main.availability_zones
  sensitive   = false
}

# RDS Outputs
output "rds_cluster_endpoint" {
  description = "RDS cluster endpoint for writer connections (HIPAA compliant)"
  value       = aws_rds_cluster.austa.endpoint
  sensitive   = true
}

output "rds_cluster_reader_endpoint" {
  description = "RDS cluster endpoint for reader connections (HIPAA compliant)"
  value       = aws_rds_cluster.austa.reader_endpoint
  sensitive   = true
}

output "rds_cluster_identifier" {
  description = "RDS cluster identifier for monitoring and management"
  value       = aws_rds_cluster.austa.cluster_identifier
  sensitive   = false
}

# ECS Outputs
output "ecs_cluster_id" {
  description = "ID of the ECS cluster for container deployment"
  value       = aws_ecs_cluster.main.id
  sensitive   = false
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster for service configuration"
  value       = aws_ecs_cluster.main.name
  sensitive   = false
}

output "ecs_capacity_providers" {
  description = "List of ECS capacity providers for scaling configuration"
  value       = aws_ecs_cluster.main.capacity_providers
  sensitive   = false
}

# KMS Outputs
output "rds_kms_key_arn" {
  description = "ARN of KMS key used for RDS encryption"
  value       = aws_kms_key.rds.arn
  sensitive   = true
}

output "s3_kms_key_arn" {
  description = "ARN of KMS key used for S3 encryption"
  value       = aws_kms_key.s3.arn
  sensitive   = true
}

output "secrets_kms_key_arn" {
  description = "ARN of KMS key used for Secrets Manager encryption"
  value       = aws_kms_key.secrets.arn
  sensitive   = true
}

# ECR Outputs
output "ecr_repository_urls" {
  description = "Map of ECR repository names to their URLs"
  value       = {
    for name, repo in aws_ecr_repository.repositories : name => repo.repository_url
  }
  sensitive   = false
}

# Security Group Outputs
output "ecs_security_group_id" {
  description = "ID of the security group attached to ECS tasks"
  value       = aws_security_group.ecs_tasks.id
  sensitive   = false
}

output "rds_security_group_id" {
  description = "ID of the security group attached to RDS instances"
  value       = aws_security_group.rds.id
  sensitive   = false
}

# Environment Information
output "environment" {
  description = "Current environment name for resource identification"
  value       = var.environment
  sensitive   = false
}

output "aws_region" {
  description = "Current AWS region for resource deployment"
  value       = var.aws_region
  sensitive   = false
}

# Service Discovery Outputs
output "service_discovery_namespace_id" {
  description = "ID of the service discovery private DNS namespace"
  value       = aws_service_discovery_private_dns_namespace.main.id
  sensitive   = false
}

output "service_discovery_namespace_arn" {
  description = "ARN of the service discovery private DNS namespace"
  value       = aws_service_discovery_private_dns_namespace.main.arn
  sensitive   = false
}

# CloudWatch Outputs
output "ecs_log_group_name" {
  description = "Name of the CloudWatch log group for ECS services"
  value       = aws_cloudwatch_log_group.ecs.name
  sensitive   = false
}

output "vpc_flow_log_group_name" {
  description = "Name of the CloudWatch log group for VPC flow logs"
  value       = aws_cloudwatch_log_group.flow_log.name
  sensitive   = false
}

# IAM Role Outputs
output "ecs_task_execution_role_arn" {
  description = "ARN of the ECS task execution role"
  value       = aws_iam_role.ecs_execution.arn
  sensitive   = false
}

output "ecs_task_role_arn" {
  description = "ARN of the ECS task role"
  value       = aws_iam_role.ecs_task.arn
  sensitive   = false
}