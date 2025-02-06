<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\RateLimiter;
use App\Services\AWS\TextractService;
use App\Services\EMR\FHIRService;
use App\Services\Video\VonageService;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Main service provider for AUSTA Integration Platform
 * 
 * Handles registration and bootstrapping of core services with
 * comprehensive security, compliance, and monitoring features.
 */
class AppServiceProvider extends ServiceProvider
{
    /**
     * Security headers configuration
     *
     * @var array
     */
    protected array $securityHeaders = [
        'X-Frame-Options' => 'DENY',
        'X-Content-Type-Options' => 'nosniff',
        'X-XSS-Protection' => '1; mode=block',
        'Strict-Transport-Security' => 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy' => "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';",
        'Referrer-Policy' => 'strict-origin-when-cross-origin',
        'Permissions-Policy' => 'camera=(), microphone=(), geolocation=()'
    ];

    /**
     * Rate limiting configuration
     *
     * @var array
     */
    protected array $rateLimits = [
        'api' => [
            'attempts' => 100,
            'decay' => 1
        ],
        'ocr' => [
            'attempts' => 50,
            'decay' => 1
        ],
        'video' => [
            'attempts' => 30,
            'decay' => 1
        ]
    ];

    /**
     * Register any application services.
     *
     * @return void
     */
    public function register(): void
    {
        // Register TextractService as singleton with encryption
        $this->app->singleton(TextractService::class, function ($app) {
            return new TextractService();
        });

        // Register FHIRService with HIPAA compliance settings
        $this->app->singleton(FHIRService::class, function ($app) {
            $baseUrl = Config::get('services.emr.base_url');
            $config = [
                'timeout' => 30,
                'connect_timeout' => 10,
                'encryption' => true,
                'compliance' => [
                    'hipaa' => true,
                    'gdpr' => true,
                    'lgpd' => true
                ]
            ];
            return new FHIRService($baseUrl, $config);
        });

        // Register VonageService with secure video settings
        $this->app->singleton(VonageService::class, function ($app) {
            return new VonageService();
        });

        // Configure rate limiting
        $this->configureRateLimiting();

        // Register audit logging channels
        $this->configureAuditLogging();
    }

    /**
     * Bootstrap any application services.
     *
     * @return void
     */
    public function boot(): void
    {
        // Apply security headers
        $this->applySecurityHeaders();

        // Configure CORS for healthcare integration
        $this->configureCors();

        // Set up monitoring and metrics
        $this->configureMonitoring();

        // Initialize error handling with logging
        $this->configureErrorHandling();
    }

    /**
     * Configure rate limiting for API endpoints
     *
     * @return void
     */
    private function configureRateLimiting(): void
    {
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute($this->rateLimits['api']['attempts'])
                ->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('ocr', function (Request $request) {
            return Limit::perMinute($this->rateLimits['ocr']['attempts'])
                ->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('video', function (Request $request) {
            return Limit::perMinute($this->rateLimits['video']['attempts'])
                ->by($request->user()?->id ?: $request->ip());
        });
    }

    /**
     * Configure audit logging channels
     *
     * @return void
     */
    private function configureAuditLogging(): void
    {
        $this->app['log']->channel('audit')->emergency('AppServiceProvider initialized');

        Config::set('logging.channels.hipaa-audit', [
            'driver' => 'daily',
            'path' => storage_path('logs/hipaa/audit.log'),
            'level' => 'info',
            'days' => 365,
            'permission' => 0600
        ]);

        Config::set('logging.channels.fhir-audit', [
            'driver' => 'daily',
            'path' => storage_path('logs/fhir/audit.log'),
            'level' => 'info',
            'days' => 365,
            'permission' => 0600
        ]);
    }

    /**
     * Apply security headers to all responses
     *
     * @return void
     */
    private function applySecurityHeaders(): void
    {
        $this->app['router']->middleware(function ($request, $next) {
            $response = $next($request);
            
            foreach ($this->securityHeaders as $header => $value) {
                $response->headers->set($header, $value);
            }

            return $response;
        });
    }

    /**
     * Configure CORS for healthcare integration
     *
     * @return void
     */
    private function configureCors(): void
    {
        Config::set('cors.paths', ['api/*', 'fhir/*']);
        Config::set('cors.allowed_methods', ['GET', 'POST', 'PUT', 'DELETE']);
        Config::set('cors.allowed_origins', [
            Config::get('app.url'),
            Config::get('services.emr.base_url')
        ]);
        Config::set('cors.allowed_headers', [
            'X-FHIR-Version',
            'X-Request-ID',
            'Authorization',
            'Content-Type'
        ]);
    }

    /**
     * Configure monitoring and metrics
     *
     * @return void
     */
    private function configureMonitoring(): void
    {
        // Configure performance monitoring
        Config::set('monitoring.performance.enabled', true);
        Config::set('monitoring.metrics.enabled', true);

        // Set up health check endpoints
        $this->app['router']->get('/health', function () {
            return response()->json(['status' => 'healthy']);
        });
    }

    /**
     * Configure error handling with logging
     *
     * @return void
     */
    private function configureErrorHandling(): void
    {
        $this->app['events']->listen('exception.occurred', function ($e) {
            Log::channel('audit')->error('Application error', [
                'exception' => get_class($e),
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
        });
    }
}