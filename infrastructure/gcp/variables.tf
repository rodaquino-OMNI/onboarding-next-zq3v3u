# Terraform variables configuration file for GCP disaster recovery environment
# Version: 1.0
# Provider: hashicorp/terraform ~> 1.0

variable "project_id" {
  type        = string
  description = "The GCP project ID where resources will be created"
  validation {
    condition     = length(var.project_id) > 0
    error_message = "Project ID must not be empty."
  }
}

variable "gcp_region" {
  type        = string
  description = "The GCP region for disaster recovery deployment"
  default     = "southamerica-east1"
  validation {
    condition     = can(regex("^[a-z]+-[a-z]+-[0-9]+$", var.gcp_region))
    error_message = "Region must be a valid GCP region name."
  }
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the VPC network"
  default     = "10.0.0.0/16"
  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block."
  }
}

variable "gke_node_pool_size" {
  type = object({
    min_node_count = number
    max_node_count = number
  })
  description = "Minimum and maximum number of nodes in the GKE node pool"
  default = {
    min_node_count = 2
    max_node_count = 8
  }
  validation {
    condition     = var.gke_node_pool_size.max_node_count >= var.gke_node_pool_size.min_node_count
    error_message = "Maximum node count must be greater than or equal to minimum node count."
  }
}

variable "db_instance_tier" {
  type        = string
  description = "The machine type for the Cloud SQL instance"
  default     = "db-custom-4-8192"
  validation {
    condition     = can(regex("^db-.*", var.db_instance_tier))
    error_message = "Database instance tier must be a valid Cloud SQL machine type."
  }
}

variable "redis_memory_size_gb" {
  type        = number
  description = "Memory size in GB for the Redis instance"
  default     = 2
  validation {
    condition     = var.redis_memory_size_gb >= 1 && var.redis_memory_size_gb <= 32
    error_message = "Redis memory size must be between 1 and 32 GB."
  }
}

variable "environment" {
  type        = string
  description = "Environment identifier for resource tagging"
  default     = "dr"
  validation {
    condition     = contains(["dr", "staging-dr", "dev-dr"], var.environment)
    error_message = "Environment must be one of: dr, staging-dr, dev-dr."
  }
}