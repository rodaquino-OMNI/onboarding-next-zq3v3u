# AWS ElastiCache Redis Configuration for AUSTA Integration Platform
# Provider version: hashicorp/aws ~> 4.0

locals {
  cluster_name        = "austa-${var.environment}-redis"
  redis_port         = 6379
  maintenance_window = "sun:05:00-sun:09:00"
  snapshot_window    = "03:00-05:00"
}

# Generate secure auth token for Redis
resource "random_password" "redis_auth" {
  length  = 32
  special = true
  upper   = true
  lower   = true
  number  = true
}

# ElastiCache subnet group for private network deployment
resource "aws_elasticache_subnet_group" "redis" {
  name        = "${var.environment}-redis-subnet-group"
  subnet_ids  = var.private_subnets.value
  
  tags = {
    Name        = "${var.environment}-redis-subnet-group"
    Environment = var.environment
    Project     = "AUSTA"
    ManagedBy   = "Terraform"
  }
}

# Redis parameter group with optimized settings
resource "aws_elasticache_parameter_group" "redis" {
  family = "redis6.x"
  name   = "${var.environment}-redis-params"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  parameter {
    name  = "tcp-keepalive"
    value = "300"
  }

  parameter {
    name  = "maxclients"
    value = "65000"
  }

  parameter {
    name  = "reserved-memory-percent"
    value = "25"
  }

  tags = {
    Environment = var.environment
    Project     = "AUSTA"
  }
}

# Redis replication group with high availability configuration
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = "${var.environment}-redis-cluster"
  description                   = "Redis cluster for AUSTA Integration Platform"
  node_type                     = var.elasticache_node_type
  port                         = local.redis_port
  parameter_group_name         = aws_elasticache_parameter_group.redis.name
  subnet_group_name            = aws_elasticache_subnet_group.redis.name
  security_group_ids           = [aws_security_group.redis.id]
  
  # High availability settings
  automatic_failover_enabled   = true
  multi_az_enabled            = true
  num_cache_clusters          = 2
  
  # Security settings
  at_rest_encryption_enabled  = true
  transit_encryption_enabled  = true
  auth_token                 = random_password.redis_auth.result
  
  # Maintenance settings
  maintenance_window         = local.maintenance_window
  snapshot_window           = local.snapshot_window
  snapshot_retention_limit  = 7
  auto_minor_version_upgrade = true
  apply_immediately         = false

  tags = {
    Name        = local.cluster_name
    Environment = var.environment
    Project     = "AUSTA"
    ManagedBy   = "Terraform"
  }
}

# Security group for Redis cluster
resource "aws_security_group" "redis" {
  name        = "${var.environment}-redis-sg"
  description = "Security group for Redis cluster"
  vpc_id      = var.vpc_id.value

  ingress {
    from_port       = local.redis_port
    to_port         = local.redis_port
    protocol        = "tcp"
    cidr_blocks     = [var.vpc_cidr]
    description     = "Redis access from VPC"
  }

  egress {
    from_port       = 0
    to_port         = 0
    protocol        = "-1"
    cidr_blocks     = ["0.0.0.0/0"]
    description     = "Allow all outbound traffic"
  }

  tags = {
    Name        = "${var.environment}-redis-sg"
    Environment = var.environment
    Project     = "AUSTA"
  }
}

# Outputs for application configuration
output "redis_endpoint" {
  description = "Redis cluster endpoint"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "redis_port" {
  description = "Redis port number"
  value       = local.redis_port
}

output "redis_auth_token" {
  description = "Redis authentication token"
  value       = random_password.redis_auth.result
  sensitive   = true
}