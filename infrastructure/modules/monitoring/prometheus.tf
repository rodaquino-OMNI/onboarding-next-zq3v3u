# Prometheus configuration for AUSTA Integration Platform
# Provider version: hashicorp/aws ~> 4.0, hashicorp/kubernetes ~> 2.0, hashicorp/helm ~> 2.0

locals {
  prometheus_namespace     = "monitoring"
  prometheus_service_account = "prometheus-sa"
  prometheus_version      = "15.10.0"
  retention_days         = "15"
  storage_size          = "50Gi"
  scrape_interval       = "15s"
  evaluation_interval   = "15s"
}

# Create dedicated namespace for monitoring
resource "kubernetes_namespace" "monitoring" {
  metadata {
    name = local.prometheus_namespace
    
    labels = {
      name        = "monitoring"
      environment = var.environment
      compliance  = "hipaa"
    }

    annotations = {
      "compliance.hipaa/audit-logging" = "enabled"
      "security.network/restricted"    = "true"
    }
  }
}

# Create service account for Prometheus
resource "kubernetes_service_account" "prometheus" {
  metadata {
    name        = local.prometheus_service_account
    namespace   = local.prometheus_namespace
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.ecs_task_role_arn
    }
  }
}

# Deploy Prometheus via Helm
resource "helm_release" "prometheus" {
  name       = "prometheus"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "prometheus"
  version    = local.prometheus_version
  namespace  = local.prometheus_namespace

  values = [
    yamlencode({
      server = {
        retention = "${local.retention_days}d"
        
        securityContext = {
          runAsNonRoot = true
          runAsUser    = 65534
          fsGroup      = 65534
        }

        persistentVolume = {
          enabled      = true
          size         = local.storage_size
          storageClass = "encrypted-gp3"
          annotations = {
            "encryption.aws/kms-key-id" = aws_kms_key.key_id
          }
        }

        resources = {
          requests = {
            cpu    = "500m"
            memory = "512Mi"
          }
          limits = {
            cpu    = "1000m"
            memory = "1Gi"
          }
        }

        global = {
          scrape_interval     = local.scrape_interval
          evaluation_interval = local.evaluation_interval
        }
      }

      alertmanager = {
        enabled = true
        config = {
          global = {
            resolve_timeout = "5m"
          }
          route = {
            group_by        = ["job", "severity"]
            group_wait      = "30s"
            group_interval  = "5m"
            repeat_interval = "12h"
            receiver       = "default"
            routes = [
              {
                match = {
                  severity = "critical"
                }
                receiver = "pagerduty"
              }
            ]
          }
        }
      }

      serviceMonitors = [
        {
          name = "api-monitor"
          selector = {
            matchLabels = {
              app = "austa-api"
            }
          }
          endpoints = [
            {
              port     = "http"
              interval = local.scrape_interval
              path     = "/metrics"
              scheme   = "https"
              tlsConfig = {
                insecureSkipVerify = false
                caFile            = "/etc/prometheus/secrets/ca.crt"
              }
            }
          ]
        }
      ]

      rules = {
        groups = [
          {
            name = "austa.sla.rules"
            rules = [
              {
                alert = "HighResponseTime"
                expr  = "http_request_duration_seconds{quantile=\"0.95\"} > 1"
                for   = "5m"
                labels = {
                  severity = "critical"
                }
                annotations = {
                  summary     = "High response time detected"
                  description = "95th percentile response time is above 1 second"
                }
              },
              {
                alert = "HighErrorRate"
                expr  = "sum(rate(http_requests_total{status=~\"5..\"}[5m])) / sum(rate(http_requests_total[5m])) > 0.01"
                for   = "5m"
                labels = {
                  severity = "critical"
                }
                annotations = {
                  summary     = "High error rate detected"
                  description = "Error rate is above 1% for 5 minutes"
                }
              },
              {
                alert = "LowUptime"
                expr  = "up < 1"
                for   = "5m"
                labels = {
                  severity = "critical"
                }
                annotations = {
                  summary     = "Service down detected"
                  description = "Service has been down for 5 minutes"
                }
              }
            ]
          }
        ]
      }

      networkPolicy = {
        enabled = true
      }

      podSecurityPolicy = {
        enabled = true
      }
    })
  ]

  set {
    name  = "server.securityContext.fsGroup"
    value = "65534"
  }

  set {
    name  = "server.securityContext.runAsUser"
    value = "65534"
  }

  set {
    name  = "server.securityContext.runAsNonRoot"
    value = "true"
  }
}