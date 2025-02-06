# AWS ECS Configuration for AUSTA Integration Platform
# Provider version: hashicorp/aws ~> 4.0

# Local variables for ECS configuration
locals {
  cluster_name = "austa-${var.environment}"
  services = ["api", "worker", "scheduler", "web"]
  default_tags = {
    Environment         = var.environment
    Project            = "AUSTA"
    ManagedBy          = "Terraform"
    SecurityCompliance = "HIPAA-GDPR-LGPD"
  }
}

# CloudWatch Log Group for ECS
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/aws/ecs/${local.cluster_name}"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.ecs_logs.arn

  tags = local.default_tags
}

# KMS key for ECS logs encryption
resource "aws_kms_key" "ecs_logs" {
  description             = "KMS key for ECS logs encryption"
  deletion_window_in_days = 7
  enable_key_rotation    = true

  tags = local.default_tags
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = local.cluster_name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  configuration {
    execute_command_configuration {
      kms_key_id = aws_kms_key.ecs_logs.arn
      logging    = "OVERRIDE"
      log_configuration {
        cloud_watch_encryption_enabled = true
        cloud_watch_log_group_name    = aws_cloudwatch_log_group.ecs.name
      }
    }
  }

  tags = local.default_tags
}

# ECS Capacity Providers
resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 1
    capacity_provider = "FARGATE"
  }
}

# IAM Role for ECS Task Execution
resource "aws_iam_role" "ecs_execution" {
  name = "${local.cluster_name}-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = local.default_tags
}

# IAM Role for ECS Tasks
resource "aws_iam_role" "ecs_task" {
  name = "${local.cluster_name}-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = local.default_tags
}

# Security Group for ECS Tasks
resource "aws_security_group" "ecs_tasks" {
  name_prefix = "${local.cluster_name}-tasks-"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.default_tags, {
    Name = "${local.cluster_name}-tasks-sg"
  })
}

# Service Discovery Private DNS Namespace
resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "austa.internal"
  vpc         = var.vpc_id
  description = "Private DNS namespace for ECS service discovery"

  tags = local.default_tags
}

# ECS Services and Task Definitions
resource "aws_ecs_task_definition" "services" {
  for_each = toset(local.services)

  family                   = "${local.cluster_name}-${each.value}"
  requires_compatibilities = ["FARGATE"]
  network_mode            = "awsvpc"
  cpu                     = var.ecs_container_cpu
  memory                  = var.ecs_container_memory
  execution_role_arn      = aws_iam_role.ecs_execution.arn
  task_role_arn          = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name         = each.value
      image        = "${aws_ecr_repository.repositories[each.value].repository_url}:latest"
      essential    = true
      environment  = []
      secrets      = []
      mountPoints  = []
      volumesFrom  = []
      healthCheck  = {
        command     = ["CMD-SHELL", "/health-check.sh"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ecs.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = each.value
        }
      }
    }
  ])

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture       = "X86_64"
  }

  tags = local.default_tags
}

resource "aws_ecs_service" "services" {
  for_each = toset(local.services)

  name                               = "${local.cluster_name}-${each.value}"
  cluster                           = aws_ecs_cluster.main.id
  task_definition                   = aws_ecs_task_definition.services[each.value].arn
  desired_count                     = var.min_capacity
  launch_type                       = "FARGATE"
  platform_version                  = "LATEST"
  health_check_grace_period_seconds = 60
  enable_execute_command            = true

  network_configuration {
    subnets          = var.private_subnets
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.services[each.value].arn
  }

  deployment_controller {
    type = "ECS"
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = local.default_tags
}

# Service Discovery for ECS Services
resource "aws_service_discovery_service" "services" {
  for_each = toset(local.services)

  name = each.value

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id
    
    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }

  tags = local.default_tags
}

# Auto Scaling for ECS Services
resource "aws_appautoscaling_target" "services" {
  for_each = toset(local.services)

  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.services[each.value].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "cpu" {
  for_each = toset(local.services)

  name               = "${local.cluster_name}-${each.value}-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.services[each.value].resource_id
  scalable_dimension = aws_appautoscaling_target.services[each.value].scalable_dimension
  service_namespace  = aws_appautoscaling_target.services[each.value].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

# Outputs
output "cluster_id" {
  description = "ECS Cluster ID"
  value       = aws_ecs_cluster.main.id
}

output "cluster_name" {
  description = "ECS Cluster Name"
  value       = aws_ecs_cluster.main.name
}

output "cluster_arn" {
  description = "ECS Cluster ARN"
  value       = aws_ecs_cluster.main.arn
}

output "service_names" {
  description = "Map of service names to service ARNs"
  value = {
    for name, service in aws_ecs_service.services : name => service.name
  }
}