# AWS RDS configuration for AUSTA Integration Platform
# Provider version: hashicorp/aws ~> 4.0

# Random password generation for RDS admin user
resource "random_password" "rds_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# RDS subnet group for multi-AZ deployment
resource "aws_db_subnet_group" "main" {
  name        = "${var.db_name}-subnet-group"
  subnet_ids  = var.private_subnets
  description = "RDS subnet group for ${var.db_name}"

  tags = {
    Name        = "${var.db_name}-subnet-group"
    Environment = var.environment
    Project     = "AUSTA"
    ManagedBy   = "Terraform"
  }
}

# RDS parameter group with optimized MySQL 8.0 settings
resource "aws_db_parameter_group" "main" {
  family = "mysql8.0"
  name   = "${var.db_name}-params"

  parameter {
    name  = "character_set_server"
    value = "utf8mb4"
  }

  parameter {
    name  = "character_set_client"
    value = "utf8mb4"
  }

  parameter {
    name  = "collation_server"
    value = "utf8mb4_unicode_ci"
  }

  parameter {
    name  = "max_connections"
    value = "1000"
  }

  parameter {
    name  = "innodb_buffer_pool_size"
    value = "{DBInstanceClassMemory*3/4}"
  }

  parameter {
    name  = "slow_query_log"
    value = "1"
  }

  parameter {
    name  = "long_query_time"
    value = "2"
  }

  tags = {
    Name        = "${var.db_name}-params"
    Environment = var.environment
    Project     = "AUSTA"
    ManagedBy   = "Terraform"
  }
}

# Security group for RDS instance
resource "aws_security_group" "rds" {
  name_prefix = "${var.db_name}-sg-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = var.db_port
    to_port         = var.db_port
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
    description     = "Allow MySQL access from ECS tasks"
  }

  tags = {
    Name        = "${var.db_name}-sg"
    Environment = var.environment
    Project     = "AUSTA"
    ManagedBy   = "Terraform"
  }
}

# IAM role for enhanced monitoring
resource "aws_iam_role" "rds_monitoring" {
  name = "${var.db_name}-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  managed_policy_arns = ["arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"]
}

# Primary RDS instance
resource "aws_db_instance" "main" {
  identifier     = var.db_name
  engine         = "mysql"
  engine_version = "8.0.28"
  
  instance_class        = var.rds_instance_class
  allocated_storage     = 100
  max_allocated_storage = 1000
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id           = var.rds_kms_key_id
  
  multi_az               = true
  db_name               = var.db_name
  username              = "admin"
  password              = random_password.rds_password.result
  port                  = var.db_port
  db_subnet_group_name  = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  parameter_group_name   = aws_db_parameter_group.main.name
  
  backup_retention_period = var.backup_retention_period
  backup_window          = "03:00-04:00"
  maintenance_window     = "Mon:04:00-Mon:05:00"
  
  auto_minor_version_upgrade = true
  deletion_protection       = true
  skip_final_snapshot      = false
  final_snapshot_identifier = "${var.db_name}-final-snapshot"
  
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  monitoring_interval                   = 60
  monitoring_role_arn                  = aws_iam_role.rds_monitoring.arn
  
  enabled_cloudwatch_logs_exports = ["audit", "error", "general", "slowquery"]
  copy_tags_to_snapshot          = true

  tags = {
    Name         = var.db_name
    Environment  = var.environment
    Project      = "AUSTA"
    ManagedBy    = "Terraform"
    Backup       = "Required"
    Compliance   = "HIPAA-GDPR-LGPD"
  }
}

# Store RDS credentials in Secrets Manager
resource "aws_secretsmanager_secret" "rds_credentials" {
  name        = "${var.db_name}-credentials"
  description = "RDS credentials for ${var.db_name}"
  kms_key_id  = var.secrets_kms_key_id

  tags = {
    Name        = "${var.db_name}-credentials"
    Environment = var.environment
    Project     = "AUSTA"
    ManagedBy   = "Terraform"
  }
}

resource "aws_secretsmanager_secret_version" "rds_credentials" {
  secret_id = aws_secretsmanager_secret.rds_credentials.id
  secret_string = jsonencode({
    username = aws_db_instance.main.username
    password = random_password.rds_password.result
    engine   = "mysql"
    host     = aws_db_instance.main.endpoint
    port     = aws_db_instance.main.port
    dbname   = aws_db_instance.main.db_name
  })
}

# Outputs
output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
}

output "rds_port" {
  description = "RDS instance port"
  value       = aws_db_instance.main.port
}

output "rds_secret_arn" {
  description = "ARN of RDS credentials secret"
  value       = aws_secretsmanager_secret.rds_credentials.arn
}