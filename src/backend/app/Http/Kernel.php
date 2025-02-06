<?php

namespace App\Http;

use Illuminate\Foundation\Http\Kernel as HttpKernel;
use Illuminate\Http\Request;

/**
 * HTTP Kernel for AUSTA Integration Platform
 * 
 * Implements zero-trust security architecture with comprehensive request lifecycle 
 * management, authentication, authorization, rate limiting, and compliance-focused 
 * security headers.
 *
 * @package App\Http
 * @version 1.0.0
 */
class Kernel extends HttpKernel
{
    /**
     * The application's global HTTP middleware stack.
     * These middleware are run during every request to your application.
     *
     * @var array<int, class-string|string>
     */
    protected $middleware = [
        // Trust proxies for proper client IP detection
        \App\Http\Middleware\TrustProxies::class,
        
        // CORS handling for healthcare API integrations
        \App\Http\Middleware\HandleCors::class,
        
        // Request validation and sanitization
        \Illuminate\Foundation\Http\Middleware\ValidatePostSize::class,
        \Illuminate\Foundation\Http\Middleware\TrimStrings::class,
        \Illuminate\Foundation\Http\Middleware\ConvertEmptyStringsToNull::class,
        
        // Security headers for HIPAA/GDPR compliance
        \App\Http\Middleware\SecurityHeaders::class,
        
        // Request logging for audit trails
        \App\Http\Middleware\AuditLogger::class,
    ];

    /**
     * The application's route middleware groups.
     *
     * @var array<string, array<int, class-string|string>>
     */
    protected $middlewareGroups = [
        'web' => [
            \Illuminate\Cookie\Middleware\EncryptCookies::class,
            \Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse::class,
            \Illuminate\Session\Middleware\StartSession::class,
            \Illuminate\View\Middleware\ShareErrorsFromSession::class,
            \App\Http\Middleware\VerifyCsrfToken::class,
            \Illuminate\Routing\Middleware\SubstituteBindings::class,
            \App\Http\Middleware\HandleInertiaRequests::class,
        ],

        'api' => [
            // Rate limiting for API endpoints
            \App\Http\Middleware\RateLimiter::class,
            
            // JWT authentication with token validation
            \App\Http\Middleware\Authenticate::class,
            
            // Role-based access control
            \App\Http\Middleware\CheckRole::class,
            
            // Route model binding
            \Illuminate\Routing\Middleware\SubstituteBindings::class,
            
            // API response formatting
            \App\Http\Middleware\FormatApiResponse::class,
            
            // Healthcare compliance headers
            \App\Http\Middleware\ComplianceHeaders::class,
        ],

        // Healthcare-specific middleware group
        'healthcare' => [
            \App\Http\Middleware\ValidateHIPAACompliance::class,
            \App\Http\Middleware\TrackPHIAccess::class,
            \App\Http\Middleware\EnforceDataEncryption::class,
        ],
    ];

    /**
     * The application's route middleware.
     * These middleware may be assigned to groups or used individually.
     *
     * @var array<string, class-string|string>
     */
    protected $routeMiddleware = [
        'auth' => \App\Http\Middleware\Authenticate::class,
        'auth.basic' => \Illuminate\Auth\Middleware\AuthenticateWithBasicAuth::class,
        'auth.session' => \Illuminate\Session\Middleware\AuthenticateSession::class,
        'cache.headers' => \Illuminate\Http\Middleware\SetCacheHeaders::class,
        'can' => \Illuminate\Auth\Middleware\Authorize::class,
        'guest' => \App\Http\Middleware\RedirectIfAuthenticated::class,
        'password.confirm' => \Illuminate\Auth\Middleware\RequirePassword::class,
        'signed' => \Illuminate\Routing\Middleware\ValidateSignature::class,
        'throttle' => \App\Http\Middleware\RateLimiter::class,
        'verified' => \Illuminate\Auth\Middleware\EnsureEmailIsVerified::class,
        'role' => \App\Http\Middleware\CheckRole::class,
        'hipaa' => \App\Http\Middleware\ValidateHIPAACompliance::class,
        'encrypt' => \App\Http\Middleware\EnforceDataEncryption::class,
        'audit' => \App\Http\Middleware\AuditLogger::class,
    ];

    /**
     * The priority-sorted list of middleware.
     * Forces the listed middleware to always be in the given order.
     *
     * @var array<int, class-string|string>
     */
    protected $middlewarePriority = [
        // Security and compliance first
        \App\Http\Middleware\SecurityHeaders::class,
        \App\Http\Middleware\HandleCors::class,
        \App\Http\Middleware\RateLimiter::class,
        
        // Authentication and authorization
        \App\Http\Middleware\Authenticate::class,
        \App\Http\Middleware\CheckRole::class,
        \Illuminate\Auth\Middleware\Authorize::class,
        
        // Session handling
        \Illuminate\Session\Middleware\StartSession::class,
        \Illuminate\View\Middleware\ShareErrorsFromSession::class,
        
        // Route binding and response formatting
        \Illuminate\Routing\Middleware\SubstituteBindings::class,
        \App\Http\Middleware\FormatApiResponse::class,
        
        // Audit logging last
        \App\Http\Middleware\AuditLogger::class,
    ];
}