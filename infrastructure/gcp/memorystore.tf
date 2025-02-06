# Google Cloud Memorystore (Redis) Configuration
# Provider version: hashicorp/google ~> 4.0
# Purpose: Disaster recovery cache layer deployment with high availability

# Local variables for Redis configuration
locals {
  redis_instance_name = "austa-cache-${var.gcp_region}"
  redis_version      = "REDIS_6_X"
  redis_tier         = "STANDARD_HA"
  redis_memory_size_gb = 2
  redis_auth_enabled = true
  redis_display_name = "AUSTA Cache - DR"
  redis_labels = merge(var.common_labels, {
    environment = "dr"
    service     = "cache"
    managed-by  = "terraform"
  })
}

# Redis instance maintenance window configuration
variable "redis_maintenance_window" {
  type = object({
    day = string
    start_time = object({
      hours   = number
      minutes = number
    })
  })
  description = "Maintenance window configuration for Redis instance updates"
  default = {
    day = "SUNDAY"
    start_time = {
      hours   = 2
      minutes = 0
    }
  }
}

# Redis backup configuration
variable "redis_backup_config" {
  type = object({
    persistence_mode    = string
    rdb_snapshot_period = string
  })
  description = "Backup configuration for Redis instance data protection"
  default = {
    persistence_mode    = "RDB"
    rdb_snapshot_period = "ONE_HOUR"
  }
}

# Primary Redis instance resource
resource "google_redis_instance" "main" {
  name               = local.redis_instance_name
  memory_size_gb     = local.redis_memory_size_gb
  region             = var.gcp_region
  project            = var.project_id
  redis_version      = local.redis_version
  tier               = local.redis_tier
  
  # Enhanced security configuration
  auth_enabled            = local.redis_auth_enabled
  transit_encryption_mode = "SERVER_AUTHENTICATION"
  authorized_network      = google_compute_network.vpc.id
  connect_mode            = "PRIVATE_SERVICE_ACCESS"
  
  # Instance metadata
  display_name = local.redis_display_name
  labels       = local.redis_labels
  
  # Maintenance configuration
  maintenance_policy {
    weekly_maintenance_window {
      day        = var.redis_maintenance_window.day
      start_time {
        hours   = var.redis_maintenance_window.start_time.hours
        minutes = var.redis_maintenance_window.start_time.minutes
      }
    }
  }
  
  # Data persistence configuration
  persistence_config {
    persistence_mode    = var.redis_backup_config.persistence_mode
    rdb_snapshot_period = var.redis_backup_config.rdb_snapshot_period
  }

  # Resource dependencies
  depends_on = [
    google_project_service.project_services,
    google_compute_network.vpc
  ]

  lifecycle {
    prevent_destroy = true
    
    # Ignore changes to labels to prevent unwanted updates
    ignore_changes = [
      labels["created_at"],
      labels["updated_at"]
    ]
  }
}

# Outputs for Redis instance details
output "redis_host" {
  description = "The IP address of the Redis instance"
  value       = google_redis_instance.main.host
  sensitive   = true
}

output "redis_port" {
  description = "The port number of the Redis instance"
  value       = google_redis_instance.main.port
}

output "redis_current_location_id" {
  description = "The current zone where the Redis instance is deployed"
  value       = google_redis_instance.main.current_location_id
}

output "redis_auth_string" {
  description = "The authentication string for Redis instance (if auth enabled)"
  value       = google_redis_instance.main.auth_string
  sensitive   = true
}