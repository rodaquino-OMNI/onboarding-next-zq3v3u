# Grafana configuration for AUSTA Integration Platform
# Provider version: hashicorp/aws ~> 4.0, hashicorp/kubernetes ~> 2.0, hashicorp/helm ~> 2.0

locals {
  grafana_namespace = "monitoring"
  grafana_service_account = "grafana-sa"
  grafana_version = "8.5.0"
  retention_days = "30"
  storage_size = "10Gi"
  security_context = {
    runAsNonRoot = true
    runAsUser = 472
    fsGroup = 472
  }
  network_policy = {
    enabled = true
    ingress_cidr = ["10.0.0.0/8"]
  }
}

# Create HIPAA-compliant Kubernetes namespace for Grafana
resource "kubernetes_namespace" "monitoring" {
  metadata {
    name = local.grafana_namespace
    labels = {
      name = "monitoring"
      environment = "production"
      compliance = "hipaa"
    }
    annotations = {
      "security.compliance.hipaa" = "enabled"
    }
  }
}

# Create secure service account for Grafana
resource "kubernetes_service_account" "grafana" {
  metadata {
    name = local.grafana_service_account
    namespace = local.grafana_namespace
    annotations = {
      "iam.amazonaws.com/role" = aws_iam_role.ecs_task_role_arn
    }
  }
}

# Deploy Grafana with HIPAA compliance configuration
resource "helm_release" "grafana" {
  name = "grafana"
  repository = "https://grafana.github.io/helm-charts"
  chart = "grafana"
  version = local.grafana_version
  namespace = local.grafana_namespace

  values = [
    {
      securityContext = local.security_context
      networkPolicy = local.network_policy

      persistence = {
        enabled = true
        size = local.storage_size
        type = "pvc"
        encrypted = true
      }

      resources = {
        requests = {
          cpu = "200m"
          memory = "256Mi"
        }
        limits = {
          cpu = "500m"
          memory = "512Mi"
        }
      }

      datasources = [
        {
          name = "Prometheus"
          type = "prometheus"
          url = prometheus_service.service_url
          access = "proxy"
          isDefault = true
          jsonData = {
            tlsAuth = true
            tlsAuthWithCACert = true
          }
        }
      ]

      dashboardProviders = {
        "dashboardproviders.yaml" = {
          apiVersion = 1
          providers = [
            {
              name = "default"
              orgId = 1
              folder = ""
              type = "file"
              disableDeletion = false
              editable = true
              options = {
                path = "/var/lib/grafana/dashboards"
              }
            }
          ]
        }
      }

      dashboards = {
        default = {
          "application-metrics" = {
            json = {
              title = "AUSTA Application Metrics"
              panels = [
                {
                  title = "Response Time"
                  type = "graph"
                  metrics = ["http_request_duration_seconds"]
                  thresholds = [
                    {
                      value = 1.0
                      colorMode = "critical"
                    }
                  ]
                },
                {
                  title = "Error Rate"
                  type = "graph"
                  metrics = ["rate(http_requests_total{status=~\"5..\"}[5m])"]
                  thresholds = [
                    {
                      value = 0.01
                      colorMode = "critical"
                    }
                  ]
                },
                {
                  title = "Enrollment Success Rate"
                  type = "gauge"
                  metrics = ["enrollment_completion_rate"]
                  thresholds = [
                    {
                      value = 0.9
                      colorMode = "ok"
                    }
                  ]
                },
                {
                  title = "HIPAA Compliance Status"
                  type = "stat"
                  metrics = ["security_compliance_status"]
                  thresholds = [
                    {
                      value = 1.0
                      colorMode = "ok"
                    }
                  ]
                }
              ]
            }
          }
        }
      }

      alerting = {
        enabled = true
        rules = [
          {
            name = "High Response Time"
            condition = "http_request_duration_seconds > 1"
            duration = "5m"
            severity = "critical"
            notifications = ["pagerduty"]
          },
          {
            name = "High Error Rate"
            condition = "sum(rate(http_requests_total{status=~\"5..\"}[5m])) / sum(rate(http_requests_total[5m])) > 0.01"
            duration = "5m"
            severity = "critical"
            notifications = ["pagerduty"]
          },
          {
            name = "Security Compliance Alert"
            condition = "security_compliance_status < 1"
            duration = "1m"
            severity = "critical"
            notifications = ["pagerduty", "security-team"]
          }
        ]
      }
    }
  ]
}