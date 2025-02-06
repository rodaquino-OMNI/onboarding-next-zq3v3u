# Jaeger distributed tracing configuration for AUSTA Integration Platform
# Provider version: hashicorp/aws ~> 4.0, hashicorp/kubernetes ~> 2.0, hashicorp/helm ~> 2.0

# Local variables for Jaeger configuration
locals {
  jaeger_namespace     = "monitoring"
  jaeger_service_account = "jaeger-sa"
  jaeger_version      = "0.69.0"
  retention_period    = "7d"
  storage_size        = "20Gi"
  collector_replicas  = "2"
  query_replicas      = "2"
}

# Create dedicated namespace for monitoring components
resource "kubernetes_namespace" "monitoring" {
  metadata {
    name = local.jaeger_namespace
    labels = {
      name        = "monitoring"
      environment = var.environment
      compliance  = "hipaa-gdpr-lgpd"
      encryption  = "enabled"
    }
  }
}

# Create service account for Jaeger with AWS IAM role binding
resource "kubernetes_service_account" "jaeger" {
  metadata {
    name        = local.jaeger_service_account
    namespace   = local.jaeger_namespace
    annotations = {
      "eks.amazonaws.com/role-arn" = aws_iam_role.ecs_task_role_arn
    }
  }
}

# Deploy Jaeger using Helm chart with enhanced configuration
resource "helm_release" "jaeger" {
  name       = "jaeger"
  repository = "https://jaegertracing.github.io/helm-charts"
  chart      = "jaeger"
  version    = local.jaeger_version
  namespace  = local.jaeger_namespace

  values = [
    yamlencode({
      collector = {
        replicaCount = local.collector_replicas
        service = {
          annotations = {
            "prometheus.io/scrape" = "true"
            "prometheus.io/port"   = "14268"
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
        autoscaling = {
          enabled = true
          minReplicas = 2
          maxReplicas = 5
          targetCPUUtilizationPercentage = 80
        }
      }
      query = {
        replicaCount = local.query_replicas
        service = {
          type = "ClusterIP"
          annotations = {
            "prometheus.io/scrape" = "true"
            "prometheus.io/port"   = "16686"
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
      }
      agent = {
        strategy = "DaemonSet"
        resources = {
          requests = {
            cpu    = "200m"
            memory = "256Mi"
          }
          limits = {
            cpu    = "500m"
            memory = "512Mi"
          }
        }
      }
      storage = {
        type = "elasticsearch"
        options = {
          es = {
            server-urls = "http://elasticsearch-master:9200"
            index-prefix = "jaeger"
            username = var.es_username
            password = var.es_password
            tls = {
              enabled = true
              ca = "/etc/ssl/certs/es-ca.crt"
            }
          }
        }
        retention = local.retention_period
        size = local.storage_size
      }
      sampling = {
        strategies = [
          {
            service = "austa-api"
            type = "probabilistic"
            param = 1.0
            operationStrategies = [
              {
                operation = "/api/v1/enrollments"
                type = "probabilistic"
                param = 1.0
              }
            ]
          },
          {
            service = "austa-web"
            type = "probabilistic"
            param = 0.5
          }
        ]
      }
      ingress = {
        enabled = true
        annotations = {
          "kubernetes.io/ingress.class" = "nginx"
          "cert-manager.io/cluster-issuer" = "letsencrypt-prod"
          "nginx.ingress.kubernetes.io/ssl-redirect" = "true"
          "nginx.ingress.kubernetes.io/force-ssl-redirect" = "true"
        }
        hosts = ["jaeger.${var.domain}"]
        tls = [
          {
            secretName = "jaeger-tls"
            hosts = ["jaeger.${var.domain}"]
          }
        ]
      }
      serviceAccount = {
        create = false
        name = local.jaeger_service_account
      }
      securityContext = {
        runAsUser = 1000
        runAsGroup = 1000
        fsGroup = 1000
      }
      podSecurityContext = {
        runAsNonRoot = true
      }
    })
  ]

  depends_on = [
    kubernetes_namespace.monitoring,
    kubernetes_service_account.jaeger
  ]
}