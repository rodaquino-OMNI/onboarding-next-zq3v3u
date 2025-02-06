# Cert-manager configuration for AUSTA Integration Platform
# Provider version: hashicorp/kubernetes ~> 2.0
# Provider version: hashicorp/helm ~> 2.0

# Variables for cert-manager configuration
variable "cert_manager_version" {
  type        = string
  description = "Version of cert-manager to install"
  default     = "v1.11.0"
}

variable "acme_email" {
  type        = string
  description = "Email address for Let's Encrypt notifications"
}

variable "hosted_zone_id" {
  type        = string
  description = "Route53 hosted zone ID for DNS validation"
}

variable "dns_role_arn" {
  type        = string
  description = "IAM role ARN for Route53 DNS validation"
}

variable "domain_name" {
  type        = string
  description = "Domain name for certificate issuance"
}

# Cert-manager Helm release
resource "helm_release" "cert_manager" {
  name             = "cert-manager"
  repository       = "https://charts.jetstack.io"
  chart            = "cert-manager"
  namespace        = "cert-manager"
  create_namespace = true
  version          = var.cert_manager_version

  set {
    name  = "installCRDs"
    value = "true"
  }

  set {
    name  = "prometheus.enabled"
    value = "true"
  }

  set {
    name  = "prometheus.servicemonitor.enabled"
    value = "true"
  }

  set {
    name  = "prometheus.servicemonitor.interval"
    value = "30s"
  }

  set {
    name  = "webhook.timeoutSeconds"
    value = "30"
  }

  set {
    name  = "webhook.replicaCount"
    value = "3"
  }

  set {
    name  = "resources.requests.memory"
    value = "256Mi"
  }

  set {
    name  = "resources.limits.memory"
    value = "512Mi"
  }

  set {
    name  = "extraArgs"
    value = "{--enable-certificate-owner-ref=true,--dns01-recursive-nameservers-only,--v=2}"
  }
}

# ClusterIssuer for Let's Encrypt certificate management
resource "kubernetes_manifest" "cluster_issuer" {
  manifest = {
    apiVersion = "cert-manager.io/v1"
    kind       = "ClusterIssuer"
    metadata = {
      name      = "letsencrypt-${var.environment}"
      namespace = "cert-manager"
      labels = {
        environment  = var.environment
        managed-by  = "terraform"
        compliance = "hipaa"
      }
      annotations = {
        "cert-manager.io/renewal-window"               = "720h"  # 30-day pre-renewal
        "cert-manager.io/issue-temporary-certificate"  = "true"
        "cert-manager.io/retry-interval"              = "2m"
      }
    }
    spec = {
      acme = {
        server         = "https://acme-v02.api.letsencrypt.org/directory"
        preferredChain = "ISRG Root X1"
        privateKeySecretRef = {
          name = "letsencrypt-${var.environment}"
        }
        solvers = [
          {
            dns01 = {
              route53 = {
                region        = var.aws_region
                hostedZoneID = var.hosted_zone_id
                assumeRoleARN = var.dns_role_arn
              }
            }
            selector = {
              dnsZones = [var.domain_name]
            }
          }
        ]
      }
    }
  }

  depends_on = [helm_release.cert_manager]
}

# Outputs for cert-manager deployment status
output "cert_manager_release" {
  description = "Status of cert-manager helm release"
  value       = helm_release.cert_manager.status
}

output "cluster_issuer_name" {
  description = "Name of created ClusterIssuer for certificate requests"
  value       = "letsencrypt-${var.environment}"
}