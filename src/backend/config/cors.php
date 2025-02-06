<?php

/**
 * Cross-Origin Resource Sharing (CORS) Configuration
 * AUSTA Integration Platform
 * 
 * This configuration implements strict security controls for healthcare data protection
 * while enabling secure cross-origin access across multi-region deployments.
 * 
 * Security Standards:
 * - HIPAA compliance for healthcare data
 * - Zero-trust architecture principles
 * - Multi-region deployment support
 * - Strict origin validation
 * 
 * @version 1.0.0
 * @package AustaHealth\Config
 */

return [
    /*
    |--------------------------------------------------------------------------
    | CORS Paths
    |--------------------------------------------------------------------------
    |
    | Paths where CORS configuration will be applied. Only API endpoints and 
    | essential authentication routes are enabled.
    |
    */
    'paths' => [
        '/api/v1/*',
        '/api/health',
        '/sanctum/csrf-cookie',
        '/api/webhooks/*',
    ],

    /*
    |--------------------------------------------------------------------------
    | Allowed Methods
    |--------------------------------------------------------------------------
    |
    | Strictly controlled set of HTTP methods allowed for cross-origin requests.
    |
    */
    'allowed_methods' => [
        'GET',
        'POST',
        'PUT',
        'DELETE',
        'OPTIONS',
        'PATCH',
    ],

    /*
    |--------------------------------------------------------------------------
    | Allowed Origins
    |--------------------------------------------------------------------------
    |
    | Explicitly allowed origins for production and staging environments.
    | Follows zero-trust principle by denying all origins by default.
    |
    */
    'allowed_origins' => [
        'https://*.austa-health.com',
        'https://*.austa-health.com.br',
        'https://admin.austa-health.com',
        'https://api.austa-health.com',
        'https://*.austa-staging.com',
    ],

    /*
    |--------------------------------------------------------------------------
    | Allowed Origins Patterns
    |--------------------------------------------------------------------------
    |
    | Regex patterns for dynamic origin validation including multi-region deployments
    | across AWS and GCP infrastructure.
    |
    */
    'allowed_origins_patterns' => [
        '^https:\/\/[a-z0-9-]+\.austa-health\.com$',
        '^https:\/\/[a-z0-9-]+\.austa-health\.com\.br$',
        '^https:\/\/[a-z0-9-]+\-austa\.(us-east-1|sa-east-1)\.aws\.com$',
        '^https:\/\/[a-z0-9-]+\-austa\.southamerica-east1\.gcp\.com$',
    ],

    /*
    |--------------------------------------------------------------------------
    | Allowed Headers
    |--------------------------------------------------------------------------
    |
    | Headers allowed in cross-origin requests, including healthcare-specific
    | and security-related headers.
    |
    */
    'allowed_headers' => [
        'Accept',
        'Authorization',
        'Content-Type',
        'X-Requested-With',
        'X-CSRF-TOKEN',
        'X-API-Key',
        'X-Request-ID',
        'X-Health-Organization',
        'X-Correlation-ID',
        'X-Region',
        'Cache-Control',
        'If-Match',
        'If-None-Match',
    ],

    /*
    |--------------------------------------------------------------------------
    | Exposed Headers
    |--------------------------------------------------------------------------
    |
    | Headers exposed to the browser, including rate limiting and tracking headers
    | for enhanced observability.
    |
    */
    'exposed_headers' => [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-Request-ID',
        'X-Correlation-ID',
        'X-Region',
        'ETag',
    ],

    /*
    |--------------------------------------------------------------------------
    | Max Age
    |--------------------------------------------------------------------------
    |
    | Maximum time (in seconds) that preflight results can be cached.
    | Set to 2 hours for optimal performance while maintaining security.
    |
    */
    'max_age' => 7200,

    /*
    |--------------------------------------------------------------------------
    | Supports Credentials
    |--------------------------------------------------------------------------
    |
    | Enable credentials support for authenticated cross-origin requests.
    | Required for secure token-based authentication.
    |
    */
    'supports_credentials' => true,
];