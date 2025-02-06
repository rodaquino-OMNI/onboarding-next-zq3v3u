# GKE cluster configuration for AUSTA Integration Platform DR environment
# Provider: hashicorp/google ~> 4.0
# Provider: hashicorp/google-beta ~> 4.0

# Local variables for GKE configuration
locals {
  cluster_name = "austa-gke-dr"
  node_pools = {
    default = {
      name           = "default-pool"
      machine_type   = "e2-standard-2"
      disk_size_gb   = 100
      disk_type      = "pd-standard"
      min_count      = 2
      max_count      = 8
      auto_scaling = {
        cpu_utilization_target    = 0.7
        memory_utilization_target = 0.8
      }
    }
  }
}

# GKE cluster resource with enhanced security and high availability
resource "google_container_cluster" "gke_cluster" {
  provider = google-beta

  name     = local.cluster_name
  location = var.gcp_region
  project  = var.project_id

  # Networking configuration
  network    = google_compute_network.vpc_network.id
  subnetwork = google_compute_subnetwork.vpc_subnets["gke-subnet"].id
  networking_mode = "VPC_NATIVE"

  # Initial node pool configuration (will be removed)
  initial_node_count       = 1
  remove_default_node_pool = true

  # Release channel for automatic upgrades
  release_channel {
    channel = "REGULAR"
  }

  # Workload identity configuration for secure service account access
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # Private cluster configuration
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block = "172.16.0.0/28"
  }

  # Master authorized networks configuration
  master_authorized_networks_config {
    cidr_blocks {
      cidr_block   = "10.0.0.0/8"
      display_name = "VPC"
    }
  }

  # Network policy configuration
  network_policy {
    enabled  = true
    provider = "CALICO"
  }

  # Pod security policy configuration
  pod_security_policy_config {
    enabled = true
  }

  # Binary authorization for container image security
  binary_authorization {
    evaluation_mode = "PROJECT_SINGLETON_POLICY_ENFORCE"
  }

  # Monitoring configuration
  monitoring_config {
    enable_components = ["SYSTEM_COMPONENTS", "WORKLOADS"]
    managed_prometheus = true
  }

  # Logging configuration
  logging_config {
    enable_components = ["SYSTEM_COMPONENTS", "WORKLOADS"]
  }

  # IP allocation policy for VPC-native cluster
  ip_allocation_policy {
    cluster_secondary_range_name  = "gke-subnet-pods"
    services_secondary_range_name = "gke-subnet-services"
  }

  # Maintenance window configuration
  maintenance_policy {
    recurring_window {
      start_time = "2023-01-01T00:00:00Z"
      end_time   = "2023-01-01T04:00:00Z"
      recurrence = "FREQ=WEEKLY;BYDAY=SA,SU"
    }
  }

  # Cluster addons
  addons_config {
    http_load_balancing {
      disabled = false
    }
    horizontal_pod_autoscaling {
      disabled = false
    }
    network_policy_config {
      disabled = false
    }
    gcp_filestore_csi_driver_config {
      enabled = true
    }
  }

  # Resource labels
  resource_labels = {
    environment = "dr"
    managed-by  = "terraform"
    app         = "austa"
  }
}

# Node pool configuration
resource "google_container_node_pool" "default_pool" {
  provider = google-beta

  name     = local.node_pools.default.name
  cluster  = google_container_cluster.gke_cluster.id
  location = var.gcp_region
  project  = var.project_id

  initial_node_count = local.node_pools.default.min_count

  # Autoscaling configuration
  autoscaling {
    min_node_count  = local.node_pools.default.min_count
    max_node_count  = local.node_pools.default.max_count
    location_policy = "BALANCED"
  }

  # Node management configuration
  management {
    auto_repair  = true
    auto_upgrade = true
  }

  # Upgrade settings
  upgrade_settings {
    max_surge       = 1
    max_unavailable = 0
  }

  # Node configuration
  node_config {
    machine_type = local.node_pools.default.machine_type
    disk_size_gb = local.node_pools.default.disk_size_gb
    disk_type    = local.node_pools.default.disk_type

    # Service account and OAuth scopes
    service_account = google_service_account.gke_sa.email
    oauth_scopes    = ["https://www.googleapis.com/auth/cloud-platform"]

    # Workload identity metadata
    workload_metadata_config {
      mode = "GKE_METADATA"
    }

    # Shielded instance configuration
    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }

    # Labels and tags
    labels = {
      environment = "dr"
      app         = "austa"
    }

    tags = ["gke-node", "private-cluster"]
  }

  lifecycle {
    ignore_changes = [
      initial_node_count
    ]
  }
}

# Service account for GKE nodes
resource "google_service_account" "gke_sa" {
  account_id   = "gke-node-sa"
  display_name = "GKE Node Service Account"
  project      = var.project_id
}

# IAM role bindings for GKE service account
resource "google_project_iam_member" "gke_sa_roles" {
  for_each = toset([
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/monitoring.viewer",
    "roles/stackdriver.resourceMetadata.writer"
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.gke_sa.email}"
}

# Outputs
output "gke_cluster_endpoint" {
  description = "GKE cluster endpoint"
  value       = google_container_cluster.gke_cluster.endpoint
  sensitive   = true
}

output "gke_cluster_ca_certificate" {
  description = "GKE cluster CA certificate"
  value       = google_container_cluster.gke_cluster.master_auth[0].cluster_ca_certificate
  sensitive   = true
}

output "gke_node_pool_instance_groups" {
  description = "Instance groups for GKE node pool"
  value       = google_container_node_pool.default_pool.instance_group_urls
}