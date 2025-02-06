<?php

namespace App\Exceptions;

use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\Log;
use Throwable;
use Ramsey\Uuid\Uuid;

/**
 * HIPAA-compliant exception handler for the healthcare enrollment platform.
 * Provides secure error handling, logging and standardized API responses.
 * 
 * @package App\Exceptions
 */
class Handler extends ExceptionHandler
{
    /**
     * Correlation ID for error tracking
     *
     * @var string
     */
    protected string $correlationId;

    /**
     * A list of sensitive fields that should not be logged or exposed
     *
     * @var array<int, string>
     */
    protected $dontFlash = [
        'password',
        'password_confirmation',
        'token',
        'health_data',
        'ssn',
        'medical_history',
        'social_security',
        'credit_card',
        'bank_account',
        'phi', // Protected Health Information
        'pii'  // Personally Identifiable Information
    ];

    /**
     * A list of the exception types that are not reported.
     *
     * @var array<int, class-string<Throwable>>
     */
    protected $dontReport = [
        AuthenticationException::class,
        ValidationException::class,
    ];

    /**
     * Initialize the exception handler with security measures
     */
    public function __construct()
    {
        $this->correlationId = Uuid::uuid4()->toString();
        parent::__construct();
    }

    /**
     * Register custom exception handling callbacks and security measures
     *
     * @return void
     */
    public function register(): void
    {
        // Handle authentication exceptions
        $this->renderable(function (AuthenticationException $e, $request) {
            if ($request->expectsJson()) {
                return response()->json([
                    'status' => 'error',
                    'code' => 401,
                    'correlation_id' => $this->correlationId,
                    'errors' => [[
                        'code' => 'AUTH_ERROR',
                        'message' => $this->getLocalizedMessage('auth.failed'),
                    ]]
                ], 401, $this->getSecurityHeaders());
            }
        });

        // Handle validation exceptions
        $this->renderable(function (ValidationException $e, $request) {
            if ($request->expectsJson()) {
                $errors = collect($e->errors())->map(function ($messages, $field) {
                    return [
                        'code' => 'VALIDATION_ERROR',
                        'message' => $messages[0],
                        'field' => $field
                    ];
                })->values()->all();

                return response()->json([
                    'status' => 'error',
                    'code' => 422,
                    'correlation_id' => $this->correlationId,
                    'errors' => $errors
                ], 422, $this->getSecurityHeaders());
            }
        });
    }

    /**
     * Render an exception into a HIPAA-compliant HTTP response
     *
     * @param  \Illuminate\Http\Request  $request
     * @param  \Throwable  $e
     * @return \Symfony\Component\HttpFoundation\Response
     */
    public function render($request, Throwable $e)
    {
        if ($request->expectsJson()) {
            $statusCode = $this->getHttpStatusCode($e);
            $sanitizedMessage = $this->sanitizeMessage($e->getMessage());
            
            return response()->json([
                'status' => 'error',
                'code' => $statusCode,
                'correlation_id' => $this->correlationId,
                'errors' => [[
                    'code' => $this->getErrorCode($e),
                    'message' => $this->getLocalizedMessage($sanitizedMessage),
                ]]
            ], $statusCode, $this->getSecurityHeaders());
        }

        return parent::render($request, $e);
    }

    /**
     * Report or log an exception with HIPAA compliance
     *
     * @param  \Throwable  $e
     * @return void
     */
    public function report(Throwable $e): void
    {
        $context = $this->getSecureLoggingContext($e);
        
        Log::error($this->sanitizeMessage($e->getMessage()), $context);

        parent::report($e);
    }

    /**
     * Get security headers for HIPAA compliance
     *
     * @return array
     */
    protected function getSecurityHeaders(): array
    {
        return [
            'X-Content-Type-Options' => 'nosniff',
            'X-Frame-Options' => 'DENY',
            'X-XSS-Protection' => '1; mode=block',
            'Strict-Transport-Security' => 'max-age=31536000; includeSubDomains',
            'Content-Security-Policy' => "default-src 'self'",
            'Cache-Control' => 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma' => 'no-cache',
            'Expires' => '0',
        ];
    }

    /**
     * Get secure logging context without sensitive data
     *
     * @param  \Throwable  $e
     * @return array
     */
    protected function getSecureLoggingContext(Throwable $e): array
    {
        return [
            'correlation_id' => $this->correlationId,
            'exception' => get_class($e),
            'file' => $this->sanitizePath($e->getFile()),
            'line' => $e->getLine(),
            'severity' => 'error',
            'timestamp' => now()->toIso8601String(),
            'environment' => config('app.env'),
        ];
    }

    /**
     * Get localized error message based on current locale
     *
     * @param  string  $message
     * @return string
     */
    protected function getLocalizedMessage(string $message): string
    {
        $locale = app()->getLocale();
        $key = "errors.$message";
        
        return __($key, [], $locale) !== $key ? 
            __($key, [], $locale) : 
            $message;
    }

    /**
     * Sanitize error message removing sensitive data
     *
     * @param  string  $message
     * @return string
     */
    protected function sanitizeMessage(string $message): string
    {
        foreach ($this->dontFlash as $sensitive) {
            $message = preg_replace(
                "/\b$sensitive\b[:=]?\s*[^\s,;]*/i",
                "$sensitive: [REDACTED]",
                $message
            );
        }
        return $message;
    }

    /**
     * Sanitize file path for logging
     *
     * @param  string  $path
     * @return string
     */
    protected function sanitizePath(string $path): string
    {
        return str_replace(base_path(), '', $path);
    }

    /**
     * Get appropriate HTTP status code for exception
     *
     * @param  \Throwable  $e
     * @return int
     */
    protected function getHttpStatusCode(Throwable $e): int
    {
        if (method_exists($e, 'getStatusCode')) {
            return $e->getStatusCode();
        }

        return match (get_class($e)) {
            AuthenticationException::class => 401,
            ValidationException::class => 422,
            default => 500
        };
    }

    /**
     * Get error code for exception type
     *
     * @param  \Throwable  $e
     * @return string
     */
    protected function getErrorCode(Throwable $e): string
    {
        return match (get_class($e)) {
            AuthenticationException::class => 'AUTH_ERROR',
            ValidationException::class => 'VALIDATION_ERROR',
            default => 'INTERNAL_SERVER_ERROR'
        };
    }
}