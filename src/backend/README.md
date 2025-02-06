# AUSTA Integration Platform - Backend API

Enterprise-grade Laravel-based backend API for the AUSTA Integration Platform, providing secure healthcare enrollment processing with HIPAA, GDPR, and LGPD compliance.

## Requirements

- PHP >= 8.1 with required extensions
- MySQL >= 8.0 with InnoDB engine
- Redis >= 6.0 for caching and queues
- Docker >= 20.10 for containerization
- Composer >= 2.0 for dependency management
- SSL certificates for secure communication
- AWS CLI for deployment management

## Local Development Setup

1. Clone the repository and navigate to the backend directory:
```bash
git clone <repository_url>
cd src/backend
```

2. Install PHP dependencies:
```bash
composer install
```

3. Copy environment configuration:
```bash
cp .env.example .env
```

4. Generate application key:
```bash
php artisan key:generate
```

5. Start Docker containers:
```bash
docker-compose up -d
```

6. Run database migrations:
```bash
php artisan migrate
```

7. Start development server:
```bash
php artisan serve
```

## Docker Environment

The application uses multiple containers orchestrated with Docker Compose:

- **nginx**: Alpine-based web server with SSL termination
- **php-fpm**: PHP 8.1 FPM with optimized configuration
- **mysql**: MySQL 8.0 with InnoDB engine
- **redis**: Redis 6.0 for caching and queues
- **prometheus**: Metrics collection

## Security Implementation

### Authentication
- JWT-based authentication with Laravel Sanctum
- Multi-factor authentication support
- Role-based access control (RBAC)
- Session management with secure defaults

### Data Protection
- AES-256-GCM encryption for sensitive data
- Field-level encryption for PHI/PII
- TLS 1.3 for data in transit
- Transparent data encryption for MySQL

### Compliance
- HIPAA-compliant audit logging
- GDPR/LGPD consent management
- Zero-trust security architecture
- Comprehensive request validation

## API Documentation

### Core Endpoints

```
POST /api/v1/enrollments
PUT  /api/v1/documents
GET  /api/v1/interviews
POST /api/v1/webhooks
```

### Response Format

```json
{
  "status": "success|error",
  "code": "HTTP_STATUS_CODE",
  "data": {
    "id": "uuid",
    "type": "resource_type",
    "attributes": {},
    "relationships": {},
    "meta": {
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  },
  "errors": [{
    "code": "ERROR_CODE",
    "message": "ERROR_MESSAGE",
    "field": "FIELD_NAME"
  }]
}
```

## Testing

Run the test suite:
```bash
php artisan test
```

Code style checking:
```bash
./vendor/bin/php-cs-fixer fix --dry-run
```

Static analysis:
```bash
./vendor/bin/phpstan analyse
```

## Deployment

### Production Requirements
- AWS ECS cluster with auto-scaling
- RDS MySQL with Multi-AZ setup
- ElastiCache Redis cluster
- CloudFront CDN distribution
- Route 53 DNS management

### Deployment Steps
1. Build Docker images:
```bash
docker-compose build
```

2. Push to ECR:
```bash
aws ecr get-login-password | docker login --username AWS --password-stdin
docker-compose push
```

3. Deploy to ECS:
```bash
aws ecs update-service --force-new-deployment
```

## Monitoring

- CloudWatch metrics and logs
- Prometheus/Grafana dashboards
- ELK stack for log aggregation
- Sentry for error tracking

## Health Checks

Available at `/health` endpoint, monitoring:
- Database connectivity
- Redis connection
- Queue processing
- Storage access
- EMR integration

## Contributing

1. Follow PSR-12 coding standards
2. Ensure tests pass and maintain coverage
3. Document API changes
4. Update security measures as needed

## License

Proprietary - All rights reserved

## Support

Contact: support@austa.local