# Cloud SQL configuration for AUSTA Integration Platform DR environment
# Provider: hashicorp/google ~> 4.0

# Local variables for database configuration
locals {
  db_instance_name = "austa-mysql-dr"
  db_backup_time   = "02:00"
  db_maintenance_window = {
    day  = 7  # Sunday
    hour = 3  # 3 AM
  }
  
  # Database flags for performance, security, and compliance
  db_flags = [
    {
      name  = "character_set_server"
      value = "utf8mb4"
    },
    {
      name  = "slow_query_log"
      value = "on"
    },
    {
      name  = "long_query_time"
      value = "1"
    },
    {
      name  = "audit_log"
      value = "on"
    },
    {
      name  = "audit_log_policy"
      value = "ALL"
    },
    {
      name  = "max_connections"
      value = "1000"
    },
    {
      name  = "innodb_buffer_pool_size"
      value = "4194304000"  # 4GB
    },
    {
      name  = "performance_schema"
      value = "on"
    }
  ]
}

# Primary Cloud SQL instance with high availability configuration
resource "google_sql_database_instance" "mysql_instance" {
  name                = local.db_instance_name
  project             = var.project_id
  region              = var.gcp_region
  database_version    = "MYSQL_8_0"
  deletion_protection = true

  # Customer-managed encryption key
  encryption_key_name = "projects/${var.project_id}/locations/${var.gcp_region}/keyRings/mysql-keyring/cryptoKeys/mysql-key"

  settings {
    tier              = var.db_instance_tier
    availability_type = "REGIONAL"  # High availability configuration

    backup_configuration {
      enabled                        = true
      binary_log_enabled            = true
      start_time                    = local.db_backup_time
      point_in_time_recovery_enabled = true
      
      backup_retention_settings {
        retained_backups = 30
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled    = false  # Disable public IP
      private_network = google_compute_network.vpc_network.id
      require_ssl     = true
      ssl_mode        = "VERIFY_X509"
    }

    database_flags = local.db_flags

    maintenance_window {
      day          = local.db_maintenance_window.day
      hour         = local.db_maintenance_window.hour
      update_track = "stable"
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length    = 1024
      record_application_tags = true
      record_client_address  = false  # HIPAA compliance
    }

    # Automated backup and high availability settings
    backup_configuration {
      enabled                        = true
      binary_log_enabled            = true
      start_time                    = local.db_backup_time
      point_in_time_recovery_enabled = true
      
      backup_retention_settings {
        retained_backups = 30
        retention_unit   = "COUNT"
      }
    }

    user_labels = {
      environment = "dr"
      application = "austa"
      compliance  = "hipaa"
      managed_by  = "terraform"
    }
  }

  # Ensure proper dependency on VPC
  depends_on = [
    google_compute_network.vpc_network
  ]

  lifecycle {
    prevent_destroy = true
    
    # Ignore changes to certain fields to prevent unwanted updates
    ignore_changes = [
      settings[0].backup_configuration[0].start_time,
      settings[0].maintenance_window,
    ]
  }
}

# Create the application database
resource "google_sql_database" "austa_db" {
  name      = "austa_platform"
  instance  = google_sql_database_instance.mysql_instance.name
  charset   = "utf8mb4"
  collation = "utf8mb4_unicode_ci"
}

# Generate SSL certificate for client connections
resource "google_sql_ssl_cert" "client_cert" {
  instance    = google_sql_database_instance.mysql_instance.name
  common_name = "austa-client"
}

# Output values for use in other configurations
output "mysql_instance" {
  description = "Cloud SQL instance details"
  value = {
    id                = google_sql_database_instance.mysql_instance.id
    connection_name   = google_sql_database_instance.mysql_instance.connection_name
    private_ip_address = google_sql_database_instance.mysql_instance.private_ip_address
    server_ca_cert    = google_sql_database_instance.mysql_instance.server_ca_cert
  }
  sensitive = true
}

output "database_name" {
  description = "The name of the application database"
  value       = google_sql_database.austa_db.name
}

output "ssl_cert" {
  description = "SSL certificate for database connections"
  value = {
    cert = google_sql_ssl_cert.client_cert.cert
    common_name = google_sql_ssl_cert.client_cert.common_name
    create_time = google_sql_ssl_cert.client_cert.create_time
    expiration_time = google_sql_ssl_cert.client_cert.expiration_time
  }
  sensitive = true
}