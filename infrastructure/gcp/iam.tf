# IAM configuration for AUSTA Integration Platform GCP DR environment
# Provider: hashicorp/google ~> 4.0

# Import required provider
terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
  }
}

# Local variables for resource naming and labeling
locals {
  service_account_prefix = "sa-austa-dr"
  common_labels = {
    project     = "austa"
    environment = "dr"
    managed_by  = "terraform"
    compliance  = "hipaa-gdpr-lgpd"
  }
}

# Service account for GKE cluster nodes
resource "google_service_account" "gke_nodes" {
  account_id   = "${local.service_account_prefix}-gke"
  display_name = "AUSTA DR GKE Node Service Account"
  description  = "Service account for GKE cluster nodes with HIPAA compliance"
  project      = local.project

  labels = local.common_labels
}

# Service account for Cloud SQL access
resource "google_service_account" "cloudsql" {
  account_id   = "${local.service_account_prefix}-sql"
  display_name = "AUSTA DR Cloud SQL Service Account"
  description  = "Service account for Cloud SQL access with data protection controls"
  project      = local.project

  labels = local.common_labels
}

# Grant logging permissions to GKE nodes
resource "google_project_iam_member" "gke_logging" {
  project = local.project
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"

  condition {
    title       = "time_bound_access"
    description = "Temporary access for audit purposes"
    expression  = "request.time < timestamp('2024-12-31T23:59:59Z')"
  }
}

# Grant monitoring permissions to GKE nodes
resource "google_project_iam_member" "gke_metrics" {
  project = local.project
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"

  condition {
    title       = "time_bound_access"
    description = "Temporary access for audit purposes"
    expression  = "request.time < timestamp('2024-12-31T23:59:59Z')"
  }
}

# Grant Cloud SQL client access
resource "google_project_iam_member" "cloudsql_client" {
  project = local.project
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloudsql.email}"

  condition {
    title       = "time_bound_access"
    description = "Temporary access for audit purposes"
    expression  = "request.time < timestamp('2024-12-31T23:59:59Z')"
  }
}

# Allow GKE workload identity binding
resource "google_service_account_iam_binding" "gke_workload_identity" {
  service_account_id = google_service_account.gke_nodes.name
  role               = "roles/iam.workloadIdentityUser"
  members            = [
    "serviceAccount:${local.project}.svc.id.goog[default/default]"
  ]

  condition {
    title       = "time_bound_access"
    description = "Temporary access for audit purposes"
    expression  = "request.time < timestamp('2024-12-31T23:59:59Z')"
  }
}

# Additional security-focused IAM roles for GKE nodes
resource "google_project_iam_member" "gke_security_roles" {
  for_each = toset([
    "roles/monitoring.viewer",
    "roles/stackdriver.resourceMetadata.writer",
    "roles/cloudtrace.agent"
  ])

  project = local.project
  role    = each.value
  member  = "serviceAccount:${google_service_account.gke_nodes.email}"

  condition {
    title       = "time_bound_access"
    description = "Temporary access for audit purposes"
    expression  = "request.time < timestamp('2024-12-31T23:59:59Z')"
  }
}

# Additional security-focused IAM roles for Cloud SQL
resource "google_project_iam_member" "cloudsql_security_roles" {
  for_each = toset([
    "roles/cloudkms.cryptoKeyEncrypterDecrypter",
    "roles/monitoring.viewer"
  ])

  project = local.project
  role    = each.value
  member  = "serviceAccount:${google_service_account.cloudsql.email}"

  condition {
    title       = "time_bound_access"
    description = "Temporary access for audit purposes"
    expression  = "request.time < timestamp('2024-12-31T23:59:59Z')"
  }
}

# Outputs for use in other Terraform configurations
output "gke_service_account" {
  description = "The email address of the GKE service account"
  value       = google_service_account.gke_nodes.email
}

output "cloudsql_service_account" {
  description = "The email address of the Cloud SQL service account"
  value       = google_service_account.cloudsql.email
}