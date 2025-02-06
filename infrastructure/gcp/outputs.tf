# Terraform outputs configuration for GCP disaster recovery environment
# Provider: hashicorp/google ~> 4.0
# Purpose: Define exposed attributes from GCP infrastructure resources

# GKE cluster endpoint for Kubernetes API access
output "gke_cluster_endpoint" {
  description = "The IP address of the GKE cluster's Kubernetes API server endpoint for disaster recovery operations"
  value       = google_container_cluster.gke_cluster.endpoint
  sensitive   = false
}

# GKE cluster CA certificate for secure authentication
output "gke_cluster_ca_certificate" {
  description = "The base64 encoded public certificate of the GKE cluster's certificate authority for secure cluster authentication"
  value       = google_container_cluster.gke_cluster.master_auth[0].cluster_ca_certificate
  sensitive   = true
}

# Cloud SQL connection name for database access
output "cloudsql_connection_name" {
  description = "The connection name of the Cloud SQL instance in the format project:region:instance for database access configuration"
  value       = google_sql_database_instance.mysql_instance.connection_name
  sensitive   = false
}

# Cloud SQL private IP for internal VPC access
output "cloudsql_private_ip" {
  description = "The private IP address of the Cloud SQL instance for secure internal VPC access in the disaster recovery environment"
  value       = google_sql_database_instance.mysql_instance.private_ip_address
  sensitive   = false
}