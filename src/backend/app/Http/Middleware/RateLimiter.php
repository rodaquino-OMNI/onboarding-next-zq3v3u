<?php

namespace App\Http\Middleware;

use Illuminate\Cache\RateLimiter as LaravelRateLimiter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter as Facade;
use Symfony\Component\HttpFoundation\Response;
use Closure;

/**
 * Advanced rate limiting middleware for AUSTA Integration Platform
 * Implements healthcare-specific rate limiting with dynamic adjustments
 * and comprehensive monitoring.
 *
 * @package App\Http\Middleware
 * @version 1.0.0
 */
class RateLimiter
{
    /**
     * Base rate limits for different endpoints (requests per minute)
     *
     * @var array<string, int>
     */
    protected array $rateLimits = [
        'api/v1/enrollments' => 100,
        'api/v1/documents' => 200,
        'api/v1/interviews' => 300,
        'api/v1/webhooks' => 500,
        'default' => 60
    ];

    /**
     * Role-based rate limit multipliers
     *
     * @var array<string, float>
     */
    protected array $roleMultipliers = [
        'admin' => 2.0,
        'broker' => 1.5,
        'interviewer' => 1.2,
        'individual' => 1.0
    ];

    /**
     * Emergency bypass rules for critical healthcare operations
     *
     * @var array<string, array>
     */
    protected array $emergencyBypassRules = [
        'urgent_care' => ['path' => 'api/v1/enrollments', 'signature' => true],
        'emergency_interview' => ['path' => 'api/v1/interviews', 'signature' => true]
    ];

    /**
     * Process the incoming request through rate limiting logic
     *
     * @param Request $request
     * @param Closure $next
     * @return Response
     */
    public function handle(Request $request, Closure $next): Response
    {
        $path = $this->getEndpointPath($request);
        $role = $request->user()?->role ?? 'individual';
        
        // Generate unique rate limit key
        $key = $this->generateLimitKey($request, $path, $role);
        
        // Get dynamic rate limit for the endpoint and role
        $limit = $this->getDynamicRateLimit($path, $role);
        
        // Check emergency bypass rules
        if ($this->shouldBypassLimit($request, $path)) {
            return $next($request);
        }

        // Attempt to rate limit
        $limiter = Facade::limiter();
        
        if ($limiter->tooManyAttempts($key, $limit)) {
            $this->logRateLimitViolation($request, $path, $role);
            return $this->buildTooManyAttemptsResponse($key, $limit);
        }

        // Track the attempt
        $limiter->hit($key, 60);

        $response = $next($request);

        // Add rate limit headers
        return $this->addRateLimitHeaders($response, $key, $limit);
    }

    /**
     * Calculate dynamic rate limit based on endpoint and role
     *
     * @param string $path
     * @param string $role
     * @return int
     */
    protected function getDynamicRateLimit(string $path, string $role): int
    {
        $baseLimit = $this->rateLimits[$path] ?? $this->rateLimits['default'];
        $multiplier = $this->roleMultipliers[$role] ?? 1.0;

        // Apply time-based adjustments (reduced limits during peak hours)
        $hour = (int) date('H');
        $timeMultiplier = ($hour >= 8 && $hour <= 17) ? 0.8 : 1.0;

        return (int) ($baseLimit * $multiplier * $timeMultiplier);
    }

    /**
     * Generate unique rate limit key based on request attributes
     *
     * @param Request $request
     * @param string $path
     * @param string $role
     * @return string
     */
    protected function generateLimitKey(Request $request, string $path, string $role): string
    {
        return sha1(implode('|', [
            $request->ip(),
            $path,
            $role,
            date('Y-m-d')
        ]));
    }

    /**
     * Check if request should bypass rate limiting
     *
     * @param Request $request
     * @param string $path
     * @return bool
     */
    protected function shouldBypassLimit(Request $request, string $path): bool
    {
        foreach ($this->emergencyBypassRules as $rule) {
            if ($rule['path'] === $path && 
                (!$rule['signature'] || $this->validateEmergencySignature($request))) {
                $this->logEmergencyBypass($request);
                return true;
            }
        }
        return false;
    }

    /**
     * Validate emergency request signature
     *
     * @param Request $request
     * @return bool
     */
    protected function validateEmergencySignature(Request $request): bool
    {
        $signature = $request->header('X-Emergency-Signature');
        $timestamp = $request->header('X-Emergency-Timestamp');
        
        if (!$signature || !$timestamp || (time() - (int) $timestamp) > 300) {
            return false;
        }

        // Validate HMAC signature
        $expected = hash_hmac('sha256', $timestamp, config('app.emergency_key'));
        return hash_equals($expected, $signature);
    }

    /**
     * Build rate limit exceeded response
     *
     * @param string $key
     * @param int $limit
     * @return Response
     */
    protected function buildTooManyAttemptsResponse(string $key, int $limit): Response
    {
        $limiter = Facade::limiter();
        $retryAfter = $limiter->availableIn($key);

        return response()->json([
            'error' => 'Too Many Attempts',
            'message' => 'Rate limit exceeded. Please try again later.',
            'retry_after' => $retryAfter
        ], 429)->withHeaders([
            'Retry-After' => $retryAfter,
            'X-RateLimit-Reset' => time() + $retryAfter,
        ]);
    }

    /**
     * Add rate limit headers to response
     *
     * @param Response $response
     * @param string $key
     * @param int $limit
     * @return Response
     */
    protected function addRateLimitHeaders(Response $response, string $key, int $limit): Response
    {
        $limiter = Facade::limiter();
        $remaining = $limit - $limiter->attempts($key);

        $response->headers->add([
            'X-RateLimit-Limit' => $limit,
            'X-RateLimit-Remaining' => max(0, $remaining),
            'X-RateLimit-Reset' => time() + (60 - (time() % 60))
        ]);

        return $response;
    }

    /**
     * Log rate limit violation for monitoring
     *
     * @param Request $request
     * @param string $path
     * @param string $role
     * @return void
     */
    protected function logRateLimitViolation(Request $request, string $path, string $role): void
    {
        \Log::warning('Rate limit exceeded', [
            'ip' => $request->ip(),
            'path' => $path,
            'role' => $role,
            'user_id' => $request->user()?->id,
            'timestamp' => now()->toIso8601String()
        ]);
    }

    /**
     * Log emergency bypass for audit trail
     *
     * @param Request $request
     * @return void
     */
    protected function logEmergencyBypass(Request $request): void
    {
        \Log::info('Emergency rate limit bypass', [
            'ip' => $request->ip(),
            'path' => $request->path(),
            'user_id' => $request->user()?->id,
            'timestamp' => now()->toIso8601String()
        ]);
    }

    /**
     * Extract normalized endpoint path from request
     *
     * @param Request $request
     * @return string
     */
    protected function getEndpointPath(Request $request): string
    {
        $path = trim($request->path(), '/');
        return $path ?: 'default';
    }
}