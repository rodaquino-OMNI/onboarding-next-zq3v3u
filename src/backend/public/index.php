<?php

/**
 * AUSTA Integration Platform - Entry Point Script
 * 
 * Handles bootstrapping the Laravel application with comprehensive security,
 * performance optimization, and HIPAA/GDPR/LGPD compliance measures.
 *
 * @version 1.0.0
 */

// Performance optimization - register optimized class loader
require __DIR__.'/../vendor/autoload.php';

// Initialize performance monitoring
$startTime = microtime(true);

/*
|--------------------------------------------------------------------------
| Initialize Error Handling
|--------------------------------------------------------------------------
*/
error_reporting(E_ALL);
ini_set('display_errors', 'Off');
ini_set('log_errors', 'On');

/*
|--------------------------------------------------------------------------
| Security Headers Initialization
|--------------------------------------------------------------------------
*/
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('X-XSS-Protection: 1; mode=block');
header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
header("Content-Security-Policy: default-src 'self'");
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Feature-Policy: camera 'none'; microphone 'none'");
header('X-Permitted-Cross-Domain-Policies: none');

/*
|--------------------------------------------------------------------------
| Verify SSL/TLS in Production
|--------------------------------------------------------------------------
*/
if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'http') {
    header('HTTP/1.1 301 Moved Permanently');
    header('Location: https://'.$_SERVER['HTTP_HOST'].$_SERVER['REQUEST_URI']);
    exit();
}

/*
|--------------------------------------------------------------------------
| Create Application Instance
|--------------------------------------------------------------------------
*/
try {
    $app = require_once __DIR__.'/../bootstrap/app.php';

    /*
    |--------------------------------------------------------------------------
    | Initialize Performance Monitoring
    |--------------------------------------------------------------------------
    */
    $app->singleton('monitoring', function ($app) {
        return new \App\Services\Monitoring\MonitoringService([
            'request_id' => uniqid('req_', true),
            'start_time' => $startTime
        ]);
    });

    /*
    |--------------------------------------------------------------------------
    | Run Application
    |--------------------------------------------------------------------------
    */
    $kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);

    // Create request with security validation
    $request = Illuminate\Http\Request::capture();

    // Validate request method
    if (!in_array($request->method(), ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'])) {
        throw new \InvalidArgumentException('Invalid HTTP method');
    }

    // Process request through security middleware pipeline
    $response = $kernel->handle($request);

    // Add security and compliance headers
    $response->headers->add([
        'X-Content-Type-Options' => 'nosniff',
        'X-Frame-Options' => 'DENY',
        'X-XSS-Protection' => '1; mode=block',
        'Strict-Transport-Security' => 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy' => "default-src 'self'",
        'Cache-Control' => 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma' => 'no-cache',
        'Expires' => '0'
    ]);

    // Send response
    $response->send();

    // Log request completion
    $duration = (microtime(true) - $startTime) * 1000;
    Log::info('Request completed', [
        'method' => $request->method(),
        'path' => $request->path(),
        'status' => $response->getStatusCode(),
        'duration_ms' => $duration
    ]);

    // Terminate request handling
    $kernel->terminate($request, $response);

} catch (Throwable $e) {
    // Log error with security context
    Log::error('Application error', [
        'error' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
        'trace' => $e->getTraceAsString(),
        'request_id' => $_SERVER['HTTP_X_REQUEST_ID'] ?? null,
        'ip' => $_SERVER['REMOTE_ADDR'] ?? null
    ]);

    // Return secure error response
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'status' => 'error',
        'message' => 'An internal server error occurred',
        'code' => 500,
        'correlation_id' => uniqid('err_', true)
    ]);
}

/*
|--------------------------------------------------------------------------
| Cleanup
|--------------------------------------------------------------------------
*/
if (function_exists('fastcgi_finish_request')) {
    fastcgi_finish_request();
}