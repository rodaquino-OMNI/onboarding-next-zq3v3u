# AWS CloudFront CDN configuration for AUSTA Integration Platform
# Provider version: hashicorp/aws ~> 4.0
# Implements secure content delivery with HIPAA, GDPR, and LGPD compliance

# Origin Access Identity for S3 bucket access
resource "aws_cloudfront_origin_access_identity" "main" {
  comment = "OAI for AUSTA Integration Platform - HIPAA Compliant"
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled    = true
  http_version       = "http2"
  price_class        = var.price_class
  aliases            = var.domain_names
  web_acl_id         = var.waf_enabled ? var.web_acl.arn : null
  comment            = "AUSTA Integration Platform CDN - HIPAA Compliant"
  default_root_object = "index.html"

  # Logging configuration
  dynamic "logging_config" {
    for_each = var.logging_enabled ? [1] : []
    content {
      include_cookies = false
      bucket         = "${aws_s3_bucket.logs.bucket_domain_name}"
      prefix         = "cdn-logs/"
    }
  }

  # S3 Origin
  origin {
    domain_name = var.document_bucket.id
    origin_id   = "S3-${var.document_bucket.id}"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.main.cloudfront_access_identity_path
    }

    origin_shield {
      enabled              = true
      origin_shield_region = var.origin_shield_region
    }
  }

  # API Origin
  origin {
    domain_name = "${var.environment}.api.austa.health"
    origin_id   = "API"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "X-Origin-Verify"
      value = random_password.origin_verify.result
    }
  }

  # Default cache behavior for S3 content
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${var.document_bucket.id}"
    viewer_protocol_policy = "redirect-to-https"
    compress              = true

    cache_policy_id          = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
    origin_request_policy_id = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf" # Managed-CORS-S3Origin
    response_headers_policy_id = "67f7725c-6f97-4210-82d7-5512b31e9d03" # Managed-SecurityHeadersPolicy

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.security_headers.arn
    }
  }

  # API endpoints cache behavior
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "API"
    viewer_protocol_policy = "https-only"
    compress              = true

    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # Managed-AllViewerExceptHostHeader
  }

  # Static assets cache behavior
  ordered_cache_behavior {
    path_pattern           = "/static/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${var.document_bucket.id}"
    viewer_protocol_policy = "https-only"
    compress              = true

    cache_policy_id          = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
    origin_request_policy_id = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf" # Managed-CORS-S3Origin
  }

  # Custom error responses
  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/errors/404.html"
    error_caching_min_ttl = 300
  }

  custom_error_response {
    error_code            = 500
    response_code         = 500
    response_page_path    = "/errors/500.html"
    error_caching_min_ttl = 60
  }

  # Geo-restriction (Brazil only)
  dynamic "restrictions" {
    for_each = var.geo_restriction_enabled ? [1] : []
    content {
      geo_restriction {
        restriction_type = "whitelist"
        locations        = ["BR"]
      }
    }
  }

  # SSL/TLS configuration
  viewer_certificate {
    acm_certificate_arn                = var.ssl_certificate_arn
    ssl_support_method                 = "sni-only"
    minimum_protocol_version           = "TLSv1.2_2021"
    cloudfront_default_certificate     = false
  }

  tags = {
    Name        = "austa-${var.environment}-cdn"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Compliance  = "HIPAA-GDPR-LGPD"
  }
}

# Security headers function
resource "aws_cloudfront_function" "security_headers" {
  name    = "security-headers-${var.environment}"
  runtime = "cloudfront-js-1.0"
  comment = "Add security headers to CloudFront responses"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var response = event.response;
      var headers = response.headers;
      
      headers['strict-transport-security'] = { value: 'max-age=31536000; includeSubdomains; preload'};
      headers['x-content-type-options'] = { value: 'nosniff'};
      headers['x-frame-options'] = { value: 'DENY'};
      headers['x-xss-protection'] = { value: '1; mode=block'};
      headers['referrer-policy'] = { value: 'strict-origin-when-cross-origin'};
      headers['content-security-policy'] = { value: "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"};
      
      return response;
    }
  EOT
}

# Random password for origin verification
resource "random_password" "origin_verify" {
  length  = 32
  special = false
}

# Outputs
output "cloudfront_distribution_id" {
  description = "The ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.id
}

output "cloudfront_domain_name" {
  description = "The domain name of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_hosted_zone_id" {
  description = "The CloudFront Route 53 zone ID"
  value       = aws_cloudfront_distribution.main.hosted_zone_id
}

output "cloudfront_origin_access_identity_path" {
  description = "The path for the origin access identity"
  value       = aws_cloudfront_origin_access_identity.main.cloudfront_access_identity_path
}