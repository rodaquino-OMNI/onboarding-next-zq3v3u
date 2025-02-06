# HashiCorp Vault configuration for AUSTA Integration Platform
# Provider version: hashicorp/helm ~> 2.0
# Provider version: hashicorp/kubernetes ~> 2.0

terraform {
  required_providers {
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
  }
}

# Variables for Vault configuration
variable "vault_version" {
  type        = string
  description = "Version of HashiCorp Vault to install"
  default     = "0.24.0"
}

variable "vault_replicas" {
  type        = number
  description = "Number of Vault replicas for high availability"
  default     = 3
}

# Create namespace for Vault
resource "kubernetes_namespace" "vault" {
  metadata {
    name = "vault"
    labels = {
      environment = var.environment
      managed-by  = "terraform"
    }
  }
}

# Deploy Vault using Helm
resource "helm_release" "vault" {
  name             = "vault"
  repository       = "https://helm.releases.hashicorp.com"
  chart            = "vault"
  namespace        = kubernetes_namespace.vault.metadata[0].name
  version          = var.vault_version
  create_namespace = false

  values = [
    yamlencode({
      global = {
        enabled = true
        tlsDisable = false
      }
      
      injector = {
        enabled = true
        replicas = 2
      }

      server = {
        ha = {
          enabled = true
          replicas = var.vault_replicas
          raft = {
            enabled = true
            setNodeId = true
            config = "retry_join {\n  leader_api_addr = \"http://vault-0.vault-internal:8200\"\n}\n"
          }
        }

        auditStorage = {
          enabled = true
          size = "10Gi"
          storageClass = "gp2"
          accessMode = "ReadWriteOnce"
        }

        dataStorage = {
          enabled = true
          size = "50Gi"
          storageClass = "gp2"
          accessMode = "ReadWriteOnce"
        }

        serviceAccount = {
          create = true
          annotations = {
            "eks.amazonaws.com/role-arn" = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/vault-server"
          }
        }

        extraEnvironmentVars = {
          VAULT_CACERT = "/vault/userconfig/tls-ca/ca.crt"
          VAULT_ADDR   = "https://127.0.0.1:8200"
        }

        extraVolumes = [{
          type = "secret"
          name = "vault-tls"
          path = "/vault/userconfig/vault-tls"
        }]

        seal = {
          type = "awskms"
          config = {
            region     = var.aws_region
            kms_key_id = var.secrets_kms_key_id
          }
        }
      }

      ui = {
        enabled = true
        serviceType = "ClusterIP"
        externalPort = 8200
        targetPort = 8200
        serviceNodePort = null
        
        annotations = {
          "nginx.ingress.kubernetes.io/backend-protocol" = "HTTPS"
          "nginx.ingress.kubernetes.io/ssl-passthrough"  = "true"
        }
      }

      # Configure Vault for high availability
      storage = {
        raft = {
          enabled = true
          config = <<-EOF
            storage "raft" {
              path = "/vault/data"
              node_id = "${POD_NAME}"
              performance_multiplier = 1
              retry_join {
                leader_api_addr = "https://vault-0.vault-internal:8200"
                leader_ca_cert_file = "/vault/userconfig/tls-ca/ca.crt"
                leader_client_cert_file = "/vault/userconfig/tls-client/tls.crt"
                leader_client_key_file = "/vault/userconfig/tls-client/tls.key"
              }
            }
          EOF
        }
      }
    })
  ]

  set {
    name  = "server.extraSecretEnvironmentVars[0].envName"
    value = "VAULT_TOKEN"
  }

  set {
    name  = "server.extraSecretEnvironmentVars[0].secretName"
    value = "vault-token"
  }

  set {
    name  = "server.extraSecretEnvironmentVars[0].secretKey"
    value = "token"
  }
}

# Output values for other modules
output "vault_status" {
  description = "Status of the Vault deployment"
  value = {
    name      = helm_release.vault.name
    namespace = helm_release.vault.namespace
    version   = helm_release.vault.version
    status    = helm_release.vault.status
  }
}

output "vault_service_name" {
  description = "Kubernetes service name for Vault access"
  value       = "vault-internal"
}

# Data source for AWS account ID
data "aws_caller_identity" "current" {}