# Google Cloud Storage configuration for AUSTA Integration Platform DR environment
# Provider: hashicorp/google ~> 4.0

# Local variables for bucket configuration
locals {
  storage_class    = "STANDARD"
  bucket_location  = var.gcp_region
  common_labels = {
    environment = "dr"
    managed_by  = "terraform"
    project     = "austa"
  }
}

# Main document storage bucket for healthcare documents
resource "google_storage_bucket" "austa_dr_documents" {
  name                        = "austa-dr-documents-${var.project_id}"
  project                     = var.project_id
  location                    = local.bucket_location
  storage_class              = local.storage_class
  uniform_bucket_level_access = true
  
  versioning {
    enabled = true
  }
  
  encryption {
    default_kms_key_name = google_kms_crypto_key.austa-dr-encryption-key.id
  }
  
  lifecycle_rule {
    condition {
      age = 90
      with_state = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }

  # CORS configuration for web access
  cors {
    origin          = ["https://*.austa.health"]
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  # Object lifecycle management
  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  labels = local.common_labels
}

# Backup storage bucket for document versioning and recovery
resource "google_storage_bucket" "austa_dr_documents_backup" {
  name                        = "austa-dr-documents-backup-${var.project_id}"
  project                     = var.project_id
  location                    = local.bucket_location
  storage_class              = local.storage_class
  uniform_bucket_level_access = true
  
  versioning {
    enabled = true
  }
  
  encryption {
    default_kms_key_name = google_kms_crypto_key.austa-dr-encryption-key.id
  }

  retention_policy {
    retention_period = 2592000 # 30 days in seconds
  }

  # Object lifecycle management for backups
  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }

  labels = local.common_labels
}

# IAM policy for document bucket
resource "google_storage_bucket_iam_binding" "document_bucket_access" {
  bucket = google_storage_bucket.austa_dr_documents.name
  role   = "roles/storage.objectViewer"
  members = [
    "serviceAccount:${var.project_id}-sa@${var.project_id}.iam.gserviceaccount.com"
  ]
}

# IAM policy for backup bucket
resource "google_storage_bucket_iam_binding" "backup_bucket_access" {
  bucket = google_storage_bucket.austa_dr_documents_backup.name
  role   = "roles/storage.objectViewer"
  members = [
    "serviceAccount:${var.project_id}-sa@${var.project_id}.iam.gserviceaccount.com"
  ]
}

# Output the document bucket details
output "document_bucket" {
  value = {
    name = google_storage_bucket.austa_dr_documents.name
    url  = "gs://${google_storage_bucket.austa_dr_documents.name}"
  }
  description = "Main document storage bucket for healthcare documents"
}

# Output the backup bucket details
output "backup_bucket" {
  value = {
    name = google_storage_bucket.austa_dr_documents_backup.name
    url  = "gs://${google_storage_bucket.austa_dr_documents_backup.name}"
  }
  description = "Backup storage bucket for document versioning and recovery"
}