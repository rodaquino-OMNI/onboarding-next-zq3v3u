<?php

namespace App\Http\Middleware;

use Illuminate\Foundation\Http\Middleware\VerifyCsrfToken as Middleware;
use Illuminate\Http\Request;
use Closure;
use Illuminate\Support\Facades\Log;
use Illuminate\Session\TokenMismatchException;

/**
 * Healthcare-specific CSRF protection middleware that validates tokens for web routes
 * while allowing configurable exclusions for specific endpoints.
 * 
 * Implements OWASP security standards and zero-trust architecture principles for
 * protecting healthcare data and enrollment processes.
 *
 * @package App\Http\Middleware
 * @version 1.0.0
 */
class VerifyCsrfToken extends Middleware
{
    /**
     * The URIs that should be excluded from CSRF verification.
     * Only add routes that absolutely require CSRF exclusion for healthcare operations.
     *
     * @var array<int, string>
     */
    protected $except = [
        // Webhook endpoints for EMR system integration
        'api/v1/webhooks/*',
        
        // Health check endpoint for load balancers
        'api/health',
        
        // Document upload endpoints that use separate authentication
        'api/v1/documents/upload/*',
        
        // Video interview service callbacks
        'api/v1/interviews/vonage-callback'
    ];

    /**
     * Handle an incoming request.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Closure  $next
     * @return mixed
     *
     * @throws \Illuminate\Session\TokenMismatchException
     */
    public function handle($request, Closure $next)
    {
        try {
            // Check if the request path should be excluded from CSRF verification
            if ($this->isReading($request) || $this->inExceptArray($request) || $this->tokensMatch($request)) {
                return $next($request);
            }

            // Log failed CSRF validation attempts for security auditing
            Log::warning('CSRF token validation failed', [
                'ip' => $request->ip(),
                'path' => $request->path(),
                'user_agent' => $request->userAgent(),
                'method' => $request->method()
            ]);

            throw new TokenMismatchException('CSRF token mismatch');
        } catch (TokenMismatchException $e) {
            // Log the exception with additional context for security monitoring
            Log::error('CSRF token mismatch exception', [
                'exception' => $e->getMessage(),
                'ip' => $request->ip(),
                'path' => $request->path(),
                'user_agent' => $request->userAgent(),
                'method' => $request->method(),
                'timestamp' => now()->toIso8601String()
            ]);

            throw $e;
        }
    }

    /**
     * Determine if the request has a valid CSRF token.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return bool
     */
    protected function tokensMatch($request)
    {
        $token = $this->getTokenFromRequest($request);
        $sessionToken = $request->session()->token();

        if (!$token || !$sessionToken) {
            return false;
        }

        // Use secure string comparison to prevent timing attacks
        return hash_equals($sessionToken, $token);
    }

    /**
     * Get the CSRF token from the request.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return string|null
     */
    protected function getTokenFromRequest($request)
    {
        // Check X-CSRF-TOKEN header first (used by JavaScript)
        $token = $request->header('X-CSRF-TOKEN');

        if (!$token) {
            // Check X-XSRF-TOKEN header (used by Angular)
            $token = $request->header('X-XSRF-TOKEN');
        }

        if (!$token) {
            // Finally check POST parameter
            $token = $request->input('_token');
        }

        return $token;
    }
}