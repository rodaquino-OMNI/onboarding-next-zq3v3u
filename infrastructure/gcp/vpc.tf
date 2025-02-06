# Provider configuration for Google Cloud Platform
# Version: ~> 4.0
terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 4.0"
    }
  }
}

# Local variables for VPC configuration
locals {
  vpc_name = "austa-vpc-dr"
  
  subnet_configs = {
    gke-subnet = {
      cidr   = "10.1.0.0/16"
      region = var.gcp_region
      purpose = "GKE cluster subnet with pod and service IP ranges"
      secondary_ranges = {
        pods     = "192.168.0.0/18"
        services = "192.168.64.0/18"
      }
    }
    sql-subnet = {
      cidr   = "10.2.0.0/16"
      region = var.gcp_region
      purpose = "CloudSQL private subnet with restricted access"
      secondary_ranges = {}
    }
    redis-subnet = {
      cidr   = "10.3.0.0/16"
      region = var.gcp_region
      purpose = "Memorystore Redis subnet for caching layer"
      secondary_ranges = {}
    }
  }

  network_tags = {
    environment = "dr"
    managed-by  = "terraform"
    compliance  = "hipaa"
  }
}

# Main VPC network resource
resource "google_compute_network" "vpc_network" {
  name                            = local.vpc_name
  project                         = var.project_id
  auto_create_subnetworks        = false
  routing_mode                   = "REGIONAL"
  delete_default_routes_on_create = true
  mtu                            = 1460
  enable_ula_internal_ipv6       = false

  lifecycle {
    prevent_destroy = true
  }
}

# Subnet configurations for different service components
resource "google_compute_subnetwork" "vpc_subnets" {
  for_each = local.subnet_configs

  name          = "${local.vpc_name}-${each.key}"
  project       = var.project_id
  network       = google_compute_network.vpc_network.id
  region        = each.value.region
  ip_cidr_range = each.value.cidr
  
  private_ip_google_access = true

  # Enable VPC flow logs for security and compliance
  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
    metadata            = "INCLUDE_ALL_METADATA"
    metadata_fields     = ["src_ip", "dst_ip", "tcp_flags", "protocol", "port"]
  }

  # Configure secondary IP ranges for GKE pods and services
  dynamic "secondary_ip_range" {
    for_each = each.value.secondary_ranges
    content {
      range_name    = "${each.key}-${secondary_ip_range.key}"
      ip_cidr_range = secondary_ip_range.value
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Private service networking connection for CloudSQL and other managed services
resource "google_compute_global_address" "private_ip_address" {
  name          = "${local.vpc_name}-private-ip"
  project       = var.project_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc_network.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc_network.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_address.name]
}

# Default network routing configuration
resource "google_compute_route" "egress_internet" {
  name             = "${local.vpc_name}-egress-internet"
  project          = var.project_id
  dest_range       = "0.0.0.0/0"
  network          = google_compute_network.vpc_network.id
  next_hop_gateway = "default-internet-gateway"
  priority         = 1000
  tags             = ["egress-internet"]
}

# Firewall rule for internal communication
resource "google_compute_firewall" "allow_internal" {
  name    = "${local.vpc_name}-allow-internal"
  project = var.project_id
  network = google_compute_network.vpc_network.id

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }
  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }
  allow {
    protocol = "icmp"
  }

  source_ranges = [for subnet in local.subnet_configs : subnet.cidr]
  target_tags   = ["internal"]
}

# Output values for use in other Terraform configurations
output "vpc_network" {
  description = "The VPC network resource"
  value = {
    id        = google_compute_network.vpc_network.id
    name      = google_compute_network.vpc_network.name
    self_link = google_compute_network.vpc_network.self_link
  }
}

output "vpc_subnets" {
  description = "The VPC subnet resources"
  value = {
    for k, v in google_compute_subnetwork.vpc_subnets : k => {
      id            = v.id
      name          = v.name
      ip_cidr_range = v.ip_cidr_range
      region        = v.region
    }
  }
}