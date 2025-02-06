# Provider configuration for Google Cloud Platform
# Version: hashicorp/google ~> 4.0
terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  backend "gcs" {
    bucket          = "austa-terraform-state-dr"
    prefix          = "terraform/state"
    encryption_key  = "${var.state_encryption_key}"
  }
}

# Primary provider configuration
provider "google" {
  project               = var.project_id
  region                = var.gcp_region
  user_project_override = true
  request_timeout       = "60s"
  default_labels        = local.common_labels
}

# Beta provider for advanced features
provider "google-beta" {
  project               = var.project_id
  region                = var.gcp_region
  user_project_override = true
  request_timeout       = "60s"
  default_labels        = local.common_labels
}

# Local variables for resource naming and tagging
locals {
  environment = "dr"
  project_name = "austa-integration-platform"
  common_labels = {
    environment          = "dr"
    project             = "austa-integration-platform"
    managed_by          = "terraform"
    compliance_level    = "hipaa"
    data_classification = "sensitive"
  }
}

# Random suffix for unique resource naming
resource "random_id" "suffix" {
  byte_length = 4
}

# Enable required GCP APIs for the project
resource "google_project_service" "project_services" {
  for_each = toset([
    "container.googleapis.com",      # GKE
    "compute.googleapis.com",        # Compute Engine
    "sql-component.googleapis.com",  # Cloud SQL
    "redis.googleapis.com",          # Memorystore
    "cloudkms.googleapis.com",       # Cloud KMS
    "servicenetworking.googleapis.com", # VPC Service Controls
    "monitoring.googleapis.com",     # Cloud Monitoring
    "logging.googleapis.com",        # Cloud Logging
    "secretmanager.googleapis.com",  # Secret Manager
    "cloudtrace.googleapis.com",     # Cloud Trace
  ])

  project = var.project_id
  service = each.value

  # Prevent Terraform from disabling APIs on destroy
  disable_on_destroy = false

  timeouts {
    create = "30m"
    update = "40m"
  }
}

# Service account for GKE nodes
resource "google_service_account" "gke_sa" {
  account_id   = "gke-node-sa-${random_id.suffix.hex}"
  display_name = "GKE Node Service Account for DR Environment"
  project      = var.project_id
  description  = "Service account for GKE nodes in disaster recovery environment"
}

# IAM roles for GKE service account
resource "google_project_iam_member" "gke_sa_roles" {
  for_each = toset([
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/monitoring.viewer",
    "roles/stackdriver.resourceMetadata.writer",
    "roles/monitoring.alertPolicyViewer",
    "roles/cloudtrace.agent",
    "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.gke_sa.email}"

  # Add conditional binding with expiration
  condition {
    title       = "expires_after_90_days"
    description = "Expires after 90 days"
    expression  = "request.time < timestamp(datetime_add(datetime('2023-01-01T00:00:00Z'), interval 90 day))"
  }
}

# Audit log configuration for enhanced security
resource "google_project_iam_audit_config" "audit_config" {
  project = var.project_id
  service = "allServices"

  audit_log_config {
    log_type = "ADMIN_READ"
  }
  audit_log_config {
    log_type = "DATA_READ"
  }
  audit_log_config {
    log_type = "DATA_WRITE"
  }
}

# Organization policies for security compliance
resource "google_project_organization_policy" "resource_location" {
  project    = var.project_id
  constraint = "constraints/gcp.resourceLocations"

  list_policy {
    allow {
      values = [
        "in:${var.gcp_region}-locations"
      ]
    }
  }
}

# VPC Service Controls for data protection
resource "google_access_context_manager_service_perimeter" "service_perimeter" {
  provider = google-beta
  parent   = "accessPolicies/${var.access_policy_id}"
  name     = "accessPolicies/${var.access_policy_id}/servicePerimeters/dr_perimeter"
  title    = "DR Environment Perimeter"
  status {
    restricted_services = [
      "container.googleapis.com",
      "sql-component.googleapis.com",
      "redis.googleapis.com",
      "cloudkms.googleapis.com"
    ]
    resources = ["projects/${var.project_id}"]
    access_levels = [var.access_level_name]
  }

  lifecycle {
    prevent_destroy = true
  }
}