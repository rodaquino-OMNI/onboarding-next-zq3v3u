<?php

use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;

/*
|--------------------------------------------------------------------------
| Create The Application
|--------------------------------------------------------------------------
|
| Initialize the AUSTA Integration Platform with zero-trust security,
| comprehensive monitoring, and EMR integration capabilities.
|
*/

$app = new Application(
    $_ENV['APP_BASE_PATH'] ?? dirname(__DIR__)
);

/*
|--------------------------------------------------------------------------
| Security Configuration
|--------------------------------------------------------------------------
|
| Configure security settings for HIPAA, GDPR, and LGPD compliance
|
*/

$app->singleton('security.validator', function ($app) {
    return new \App\Services\Security\SecurityValidator([
        'encryption_key' => config('app.key'),
        'cipher' => 'AES-256-GCM',
        'ssl_verify' => true,
        'secure_headers' => true
    ]);
});

/*
|--------------------------------------------------------------------------
| Monitoring Configuration
|--------------------------------------------------------------------------
|
| Set up comprehensive monitoring with ELK stack integration
|
*/

$app->singleton('monitoring', function ($app) {
    return new \App\Services\Monitoring\MonitoringService([
        'elk_host' => config('logging.elk.host'),
        'metrics_enabled' => true,
        'tracing_enabled' => true,
        'health_check_interval' => 60
    ]);
});

/*
|--------------------------------------------------------------------------
| Bind Important Interfaces
|--------------------------------------------------------------------------
|
| Configure core service bindings with enhanced security and monitoring
|
*/

$app->singleton(
    Illuminate\Contracts\Http\Kernel::class,
    App\Http\Kernel::class
);

$app->singleton(
    Illuminate\Contracts\Console\Kernel::class,
    App\Console\Kernel::class
);

$app->singleton(
    Illuminate\Contracts\Debug\ExceptionHandler::class,
    App\Exceptions\Handler::class
);

/*
|--------------------------------------------------------------------------
| Health Check Configuration
|--------------------------------------------------------------------------
|
| Configure health checks for system components
|
*/

$app->singleton('health', function ($app) {
    return new \App\Services\Health\HealthCheckService([
        'components' => [
            'database' => true,
            'cache' => true,
            'storage' => true,
            'queue' => true,
            'emr_integration' => true
        ],
        'threshold' => 0.8
    ]);
});

/*
|--------------------------------------------------------------------------
| EMR Integration Configuration
|--------------------------------------------------------------------------
|
| Set up FHIR-compliant EMR integration
|
*/

$app->singleton('emr.integration', function ($app) {
    return new \App\Services\EMR\FHIRService(
        config('services.emr.base_url'),
        [
            'timeout' => 30,
            'verify_ssl' => true,
            'version' => '4.0.1'
        ]
    );
});

/*
|--------------------------------------------------------------------------
| Webhook Configuration
|--------------------------------------------------------------------------
|
| Configure secure webhook delivery system
|
*/

$app->singleton('webhook', function ($app) {
    return new \App\Services\Webhook\WebhookService([
        'max_retries' => 3,
        'timeout' => 30,
        'signature_header' => 'X-Webhook-Signature'
    ]);
});

/*
|--------------------------------------------------------------------------
| Cache Configuration
|--------------------------------------------------------------------------
|
| Configure distributed caching with Redis
|
*/

$app->singleton('cache', function ($app) {
    return Cache::driver()->tags(['austa']);
});

/*
|--------------------------------------------------------------------------
| Error Handling Configuration
|--------------------------------------------------------------------------
|
| Set up comprehensive error handling and logging
|
*/

$app->configureMonologUsing(function ($monolog) {
    $monolog->pushHandler(new \Monolog\Handler\ElasticsearchHandler(
        new \Elasticsearch\Client([
            'hosts' => [config('logging.elk.host')]
        ]),
        'austa-logs',
        \Monolog\Logger::WARNING
    ));
});

/*
|--------------------------------------------------------------------------
| Security Middleware Configuration
|--------------------------------------------------------------------------
|
| Configure security middleware stack
|
*/

$app->middleware([
    \App\Http\Middleware\SecurityHeaders::class,
    \App\Http\Middleware\TrustProxies::class,
    \App\Http\Middleware\ValidateHIPAACompliance::class,
]);

/*
|--------------------------------------------------------------------------
| Register Service Providers
|--------------------------------------------------------------------------
|
| Register core service providers with security enhancements
|
*/

$app->register(\App\Providers\SecurityServiceProvider::class);
$app->register(\App\Providers\MonitoringServiceProvider::class);
$app->register(\App\Providers\EMRServiceProvider::class);
$app->register(\App\Providers\WebhookServiceProvider::class);

/*
|--------------------------------------------------------------------------
| Load Environment Configuration
|--------------------------------------------------------------------------
|
| Load and validate environment configuration
|
*/

try {
    (new \Dotenv\Dotenv($app->environmentPath()))->load();
    
    if (!validateEnvironmentSecurity()) {
        throw new \RuntimeException('Environment security validation failed');
    }
} catch (\Throwable $e) {
    Log::emergency('Environment configuration error', [
        'error' => $e->getMessage(),
        'trace' => $e->getTraceAsString()
    ]);
    exit(1);
}

/*
|--------------------------------------------------------------------------
| Return The Application
|--------------------------------------------------------------------------
|
| Return the configured application instance
|
*/

return $app;

/**
 * Validate environment security configuration
 *
 * @return bool
 */
function validateEnvironmentSecurity(): bool
{
    $requiredSettings = [
        'APP_KEY',
        'DB_ENCRYPTION_KEY',
        'JWT_SECRET',
        'EMR_API_KEY'
    ];

    foreach ($requiredSettings as $setting) {
        if (empty(env($setting))) {
            Log::error("Missing required security setting: {$setting}");
            return false;
        }
    }

    if (env('APP_ENV') === 'production' && !env('APP_DEBUG')) {
        if (!env('FORCE_HTTPS', true)) {
            Log::error('HTTPS must be enforced in production');
            return false;
        }
    }

    return true;
}