<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiter; // ^9.0
use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider; // ^9.0
use Illuminate\Http\Request; // ^9.0
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Enhanced RouteServiceProvider with comprehensive security features
 * 
 * Implements secure routing configuration with zero-trust architecture,
 * rate limiting, and audit logging for the AUSTA Integration Platform.
 */
class RouteServiceProvider extends ServiceProvider
{
    /**
     * The path to the "home" route for your application.
     *
     * @var string
     */
    public const HOME = '/dashboard';

    /**
     * API version prefix
     *
     * @var string
     */
    protected const API_PREFIX = '/api/v1';

    /**
     * Security headers configuration
     *
     * @var array
     */
    protected array $securityHeaders = [
        'X-Content-Type-Options' => 'nosniff',
        'X-Frame-Options' => 'DENY',
        'X-XSS-Protection' => '1; mode=block',
        'Strict-Transport-Security' => 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy' => "default-src 'self'; frame-ancestors 'none';",
        'Referrer-Policy' => 'strict-origin-when-cross-origin',
        'Permissions-Policy' => 'geolocation=(), microphone=(), camera=()',
        'Cache-Control' => 'no-store, no-cache, must-revalidate, proxy-revalidate'
    ];

    /**
     * CORS configuration for Angular frontend
     *
     * @var array
     */
    protected array $corsSettings = [
        'allowed_origins' => ['https://*.austa.health'],
        'allowed_methods' => ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        'allowed_headers' => ['Content-Type', 'Authorization', 'X-Requested-With'],
        'exposed_headers' => ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
        'max_age' => 7200
    ];

    /**
     * Define your route model bindings, pattern filters, etc.
     *
     * @return void
     */
    public function boot(): void
    {
        // Initialize parent boot process
        parent::boot();

        // Configure security headers and CORS
        $this->configureSecurity();

        // Configure rate limiting
        $this->configureRateLimiting();

        // Configure route patterns
        $this->configureRoutePatterns();

        // Load routes with proper middleware
        $this->routes(function () {
            // API Routes with versioning and security
            Route::prefix(self::API_PREFIX)
                ->middleware([
                    'api',
                    'security.headers',
                    'cors',
                    'audit.log',
                    'hipaa.compliance'
                ])
                ->group(base_path('routes/api.php'));

            // Web Routes with security
            Route::middleware([
                'web',
                'security.headers',
                'session.secure',
                'csrf'
            ])
            ->group(base_path('routes/web.php'));
        });

        // Register global middleware
        $this->registerGlobalMiddleware();
    }

    /**
     * Configure the rate limiters for the application.
     *
     * @return void
     */
    protected function configureRateLimiting(): void
    {
        $rateLimiter = $this->app->make(RateLimiter::class);

        // Rate limit for authenticated API requests
        $rateLimiter->for('api', function (Request $request) {
            $user = $request->user();
            
            return [
                'key' => $user ? "api:{$user->id}" : "api:{$request->ip()}",
                'limit' => $user ? 1000 : 60,
                'decay' => 60,
                'response' => function() {
                    return response()->json([
                        'status' => 'error',
                        'code' => 'RATE_LIMIT_EXCEEDED',
                        'message' => 'Too many requests'
                    ], 429);
                }
            ];
        });

        // Rate limit for authentication endpoints
        $rateLimiter->for('auth', function (Request $request) {
            return [
                'key' => "auth:{$request->ip()}",
                'limit' => 6,
                'decay' => 60,
                'response' => function() {
                    return response()->json([
                        'status' => 'error',
                        'code' => 'AUTH_RATE_LIMIT',
                        'message' => 'Authentication rate limit exceeded'
                    ], 429);
                }
            ];
        });

        // Rate limit for webhook endpoints
        $rateLimiter->for('webhooks', function (Request $request) {
            return [
                'key' => "webhook:{$request->ip()}",
                'limit' => 300,
                'decay' => 60
            ];
        });
    }

    /**
     * Configure security headers and CORS settings.
     *
     * @return void
     */
    protected function configureSecurity(): void
    {
        // Register security headers middleware
        $this->app['router']->aliasMiddleware('security.headers', function ($request, $next) {
            $response = $next($request);
            
            foreach ($this->securityHeaders as $header => $value) {
                $response->headers->set($header, $value);
            }

            return $response;
        });

        // Configure CORS middleware
        $this->app['router']->aliasMiddleware('cors', function ($request, $next) {
            $response = $next($request);
            
            if ($request->isMethod('OPTIONS')) {
                $response->headers->set('Access-Control-Allow-Methods', 
                    implode(', ', $this->corsSettings['allowed_methods']));
                $response->headers->set('Access-Control-Allow-Headers', 
                    implode(', ', $this->corsSettings['allowed_headers']));
                $response->headers->set('Access-Control-Max-Age', 
                    $this->corsSettings['max_age']);
            }

            $origin = $request->header('Origin');
            if ($this->isAllowedOrigin($origin)) {
                $response->headers->set('Access-Control-Allow-Origin', $origin);
                $response->headers->set('Access-Control-Expose-Headers', 
                    implode(', ', $this->corsSettings['exposed_headers']));
            }

            return $response;
        });
    }

    /**
     * Configure route patterns and constraints.
     *
     * @return void
     */
    protected function configureRoutePatterns(): void
    {
        // UUID pattern for IDs
        Route::pattern('id', '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}');
        
        // API version pattern
        Route::pattern('version', 'v[1-9][0-9]*');
        
        // Language pattern
        Route::pattern('locale', 'en|pt-BR');
    }

    /**
     * Register global middleware for the application.
     *
     * @return void
     */
    protected function registerGlobalMiddleware(): void
    {
        // Audit logging middleware
        $this->app['router']->aliasMiddleware('audit.log', function ($request, $next) {
            $requestId = (string) Str::uuid();
            
            Log::channel('audit')->info('Request initiated', [
                'request_id' => $requestId,
                'method' => $request->method(),
                'url' => $request->fullUrl(),
                'ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'user_id' => $request->user()?->id
            ]);

            $response = $next($request);

            Log::channel('audit')->info('Request completed', [
                'request_id' => $requestId,
                'status' => $response->status(),
                'duration_ms' => defined('LARAVEL_START') ? 
                    (microtime(true) - LARAVEL_START) * 1000 : null
            ]);

            return $response;
        });

        // HIPAA compliance middleware
        $this->app['router']->aliasMiddleware('hipaa.compliance', function ($request, $next) {
            if (!$request->secure() && !$request->is('health')) {
                return response()->json([
                    'status' => 'error',
                    'code' => 'INSECURE_CONNECTION',
                    'message' => 'HTTPS is required for HIPAA compliance'
                ], 403);
            }

            return $next($request);
        });
    }

    /**
     * Check if origin is allowed by CORS policy.
     *
     * @param string|null $origin
     * @return bool
     */
    protected function isAllowedOrigin(?string $origin): bool
    {
        if (!$origin) {
            return false;
        }

        foreach ($this->corsSettings['allowed_origins'] as $allowed) {
            $pattern = str_replace('\*', '.*', preg_quote($allowed, '/'));
            if (preg_match('/^' . $pattern . '$/', $origin)) {
                return true;
            }
        }

        return false;
    }
}