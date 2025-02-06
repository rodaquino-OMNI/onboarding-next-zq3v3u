# Configure Google Cloud KMS resources for encryption key management in DR environment
# Provider version: hashicorp/google ~> 4.0

# KMS key ring for managing encryption keys
resource "google_kms_key_ring" "austa-dr-keyring" {
  name     = "austa-dr-keyring"
  location = local.region
  project  = local.project
  labels   = local.common_labels
}

# Encryption key for PHI fields and sensitive data
resource "google_kms_crypto_key" "austa-dr-encryption-key" {
  name            = "austa-dr-encryption-key"
  key_ring        = google_kms_key_ring.austa-dr-keyring.id
  rotation_period = "7776000s" # 90-day rotation period
  purpose         = "ENCRYPT_DECRYPT"

  version_template {
    protection_level = "HSM"
    algorithm       = "GOOGLE_SYMMETRIC_ENCRYPTION"
  }

  labels = local.common_labels

  lifecycle {
    prevent_destroy = true
  }
}

# IAM binding for controlled access to KMS encryption keys
resource "google_kms_crypto_key_iam_binding" "encryption_key_access" {
  crypto_key_id = google_kms_crypto_key.austa-dr-encryption-key.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  members       = [
    "serviceAccount:${local.project}-sa@${local.project}.iam.gserviceaccount.com"
  ]
}

# Output the KMS keyring details for reference
output "kms_keyring" {
  value = {
    name     = google_kms_key_ring.austa-dr-keyring.name
    location = google_kms_key_ring.austa-dr-keyring.location
  }
  description = "KMS keyring details for DR environment"
  sensitive   = false
}

# Output the crypto key details for reference
output "kms_crypto_key" {
  value = {
    name            = google_kms_crypto_key.austa-dr-encryption-key.name
    key_ring        = google_kms_crypto_key.austa-dr-encryption-key.key_ring
    rotation_period = google_kms_crypto_key.austa-dr-encryption-key.rotation_period
  }
  description = "KMS crypto key details for DR environment"
  sensitive   = false
}