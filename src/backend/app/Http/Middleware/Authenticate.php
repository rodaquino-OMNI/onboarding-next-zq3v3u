<?php

namespace App\Http\Middleware;

use Illuminate\Auth\Middleware\Authenticate as BaseAuthenticate;
use Illuminate\Http\Request;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;
use Firebase\JWT\JWT; // ^6.4
use Firebase\JWT\Key; // ^6.4
use Carbon\Carbon; // ^2.66

class Authenticate extends BaseAuthenticate
{
    /**
     * JWT token lifetime in seconds (1 hour)
     */
    private const TOKEN_LIFETIME = 3600;

    /**
     * Required JWT claims for validation
     */
    private const REQUIRED_CLAIMS = ['iss', 'aud', 'sub', 'exp', 'iat', 'jti'];

    /**
     * Get the path the user should be redirected to when they are not authenticated.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return string|null
     */
    protected function redirectTo(Request $request): ?string
    {
        return $request->expectsJson() ? null : route('login');
    }

    /**
     * Handle an incoming request with zero-trust security validation.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Closure  $next
     * @param  string[]  ...$guards
     * @return mixed
     *
     * @throws \Illuminate\Auth\AuthenticationException
     */
    public function handle($request, \Closure $next, ...$guards)
    {
        try {
            // Extract JWT token from Authorization header
            $token = $this->extractToken($request);
            if (!$token) {
                throw new AuthenticationException('Missing or invalid authentication token');
            }

            // Validate token format and structure
            $payload = $this->validateToken($token);

            // Verify user context and security state
            $this->verifySecurityContext($request, $payload);

            // Log successful authentication for HIPAA compliance
            $this->logAuthenticationAttempt($request, $payload, true);

            return parent::handle($request, $next, $guards);

        } catch (\Exception $e) {
            // Log failed authentication attempt
            $this->logAuthenticationAttempt($request, $payload ?? null, false, $e->getMessage());
            
            throw new AuthenticationException($e->getMessage());
        }
    }

    /**
     * Extract and validate JWT token from request header.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return string|null
     */
    private function extractToken(Request $request): ?string
    {
        $header = $request->header('Authorization');
        if (!$header || !preg_match('/^Bearer\s+(.+)$/i', $header, $matches)) {
            return null;
        }
        return $matches[1];
    }

    /**
     * Validate JWT token structure and signature.
     *
     * @param  string  $token
     * @return object
     * @throws \Exception
     */
    private function validateToken(string $token): object
    {
        // Verify token signature using public key
        $publicKey = config('auth.jwt.public_key');
        $payload = JWT::decode($token, new Key($publicKey, 'RS256'));

        // Validate required claims
        foreach (self::REQUIRED_CLAIMS as $claim) {
            if (!isset($payload->{$claim})) {
                throw new \Exception("Missing required claim: {$claim}");
            }
        }

        // Verify token expiry
        if ($payload->exp < time()) {
            throw new \Exception('Token has expired');
        }

        // Verify token is not blacklisted
        if (Cache::has("blacklisted_token:{$payload->jti}")) {
            throw new \Exception('Token has been revoked');
        }

        // Verify issuer
        if ($payload->iss !== config('app.url')) {
            throw new \Exception('Invalid token issuer');
        }

        return $payload;
    }

    /**
     * Verify security context of the request against token claims.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  object  $payload
     * @return void
     * @throws \Exception
     */
    private function verifySecurityContext(Request $request, object $payload): void
    {
        // Verify request origin matches token origin
        $origin = $request->header('Origin');
        if ($origin && $origin !== $payload->aud) {
            throw new \Exception('Origin mismatch');
        }

        // Validate client IP if IP binding is enabled
        if (isset($payload->ip) && $payload->ip !== $request->ip()) {
            throw new \Exception('IP address mismatch');
        }

        // Verify user exists and is active
        $user = \App\Models\User::find($payload->sub);
        if (!$user || !$user->is_active) {
            throw new \Exception('User not found or inactive');
        }

        // Verify user roles and permissions if specified in token
        if (isset($payload->roles) && !$user->hasAnyRole($payload->roles)) {
            throw new \Exception('Insufficient permissions');
        }
    }

    /**
     * Log authentication attempt for HIPAA compliance.
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  object|null  $payload
     * @param  bool  $success
     * @param  string|null  $error
     * @return void
     */
    private function logAuthenticationAttempt(
        Request $request,
        ?object $payload,
        bool $success,
        ?string $error = null
    ): void {
        Log::channel('security')->info('Authentication attempt', [
            'timestamp' => Carbon::now()->toIso8601String(),
            'success' => $success,
            'user_id' => $payload->sub ?? null,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'request_uri' => $request->getRequestUri(),
            'error' => $error,
            'correlation_id' => $request->header('X-Correlation-ID'),
        ]);
    }
}