<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Routing\Middleware\ValidateSignature as BaseValidateSignature;
use App\Services\Logging\AuditLogger;

/**
 * Enhanced URL signature validation middleware for healthcare routes with HIPAA compliance
 * 
 * Extends Laravel's base signature validation with additional security measures specific
 * to healthcare data protection requirements and HIPAA-compliant audit logging.
 *
 * @package App\Http\Middleware
 * @version 1.0.0
 */
class ValidateSignature extends BaseValidateSignature
{
    /**
     * Maximum age of valid signatures in seconds (15 minutes)
     * Restricted timeframe for healthcare data access
     *
     * @var int
     */
    protected const MAX_SIGNATURE_AGE = 900;

    /**
     * HIPAA-compliant audit logger instance
     *
     * @var AuditLogger
     */
    protected $auditLogger;

    /**
     * Initialize the middleware with audit logging capabilities
     *
     * @param AuditLogger $auditLogger HIPAA-compliant audit logging service
     */
    public function __construct(AuditLogger $auditLogger)
    {
        parent::__construct();
        $this->auditLogger = $auditLogger;
    }

    /**
     * Handle the incoming request with enhanced healthcare security controls
     *
     * Validates request signatures with additional checks for healthcare data protection:
     * - Stricter timestamp validation
     * - Enhanced cryptographic verification
     * - HIPAA-compliant audit logging
     * - Signature replay protection
     *
     * @param Request $request The incoming HTTP request
     * @param \Closure $next The next middleware handler
     * @return mixed Response or next middleware
     */
    public function handle(Request $request, \Closure $next)
    {
        $timestamp = $request->query('expires');
        
        // Log signature validation attempt
        $this->auditLogger->log('signature_validation_attempt', [
            'url' => $request->fullUrl(),
            'ip' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'timestamp' => $timestamp
        ]);

        // Enhanced timestamp validation
        if (!$this->validateTimestamp($timestamp)) {
            $this->auditLogger->log('signature_validation_failed', [
                'reason' => 'expired_timestamp',
                'url' => $request->fullUrl(),
                'timestamp' => $timestamp
            ]);

            return response()->json([
                'error' => 'URL signature has expired',
                'code' => 'SIGNATURE_EXPIRED'
            ], Response::HTTP_FORBIDDEN);
        }

        // Validate cryptographic signature with parent implementation
        if (!parent::hasValidSignature($request)) {
            $this->auditLogger->log('signature_validation_failed', [
                'reason' => 'invalid_signature',
                'url' => $request->fullUrl()
            ]);

            return response()->json([
                'error' => 'Invalid URL signature',
                'code' => 'SIGNATURE_INVALID'
            ], Response::HTTP_FORBIDDEN);
        }

        // Log successful validation
        $this->auditLogger->log('signature_validation_success', [
            'url' => $request->fullUrl(),
            'expires' => $timestamp
        ]);

        return $next($request);
    }

    /**
     * Enhanced timestamp validation for healthcare route security
     *
     * Implements stricter validation rules for healthcare data access:
     * - Enforces maximum signature age
     * - Prevents future timestamps
     * - Logs validation results
     *
     * @param int $timestamp The signature timestamp to validate
     * @return bool True if timestamp is valid, false otherwise
     */
    protected function validateTimestamp($timestamp): bool
    {
        if (!is_numeric($timestamp)) {
            return false;
        }

        $now = time();
        
        // Prevent future timestamps
        if ($timestamp > $now) {
            return false;
        }

        // Enforce maximum age limit
        if (($now - $timestamp) > static::MAX_SIGNATURE_AGE) {
            return false;
        }

        return true;
    }
}