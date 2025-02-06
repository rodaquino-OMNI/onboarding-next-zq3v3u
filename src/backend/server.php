<?php

/**
 * AUSTA Integration Platform Development Server
 * 
 * Provides secure and optimized URL rewriting functionality for Laravel application
 * during local development with enterprise-grade security measures.
 *
 * @version 1.0.0
 */

// Initialize security headers
$securityHeaders = [
    'X-Content-Type-Options' => 'nosniff',
    'X-Frame-Options' => 'DENY',
    'X-XSS-Protection' => '1; mode=block',
    'Strict-Transport-Security' => 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy' => "default-src 'self'",
    'Referrer-Policy' => 'strict-origin-when-cross-origin',
    'Feature-Policy' => "camera 'none'; microphone 'none'",
    'X-Permitted-Cross-Domain-Policies' => 'none'
];

// Define allowed MIME types for static files
$mimeTypes = [
    'css' => 'text/css',
    'js' => 'application/javascript',
    'json' => 'application/json',
    'png' => 'image/png',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'gif' => 'image/gif',
    'svg' => 'image/svg+xml',
    'woff' => 'font/woff',
    'woff2' => 'font/woff2',
    'ttf' => 'font/ttf',
    'eot' => 'application/vnd.ms-fontobject',
    'ico' => 'image/x-icon'
];

/**
 * Parse and sanitize request URI
 *
 * @param string $uri Request URI
 * @return string Sanitized path
 */
function parseUri(string $uri): string {
    // Remove query string
    if ($pos = strpos($uri, '?')) {
        $uri = substr($uri, 0, $pos);
    }
    
    // URL decode and convert to relative path
    $uri = rawurldecode($uri);
    
    // Remove directory traversal attempts
    $uri = str_replace(['../', './'], '', $uri);
    
    // Normalize directory separators
    $uri = str_replace('\\', '/', $uri);
    
    // Validate path length and characters
    if (strlen($uri) > 2048 || !preg_match('/^[a-zA-Z0-9\/_.-]+$/', $uri)) {
        header('HTTP/1.1 400 Bad Request');
        exit('Invalid request path');
    }
    
    return $uri;
}

/**
 * Validate if path points to an existing static file
 *
 * @param string $path File path
 * @return bool True if valid static file
 */
function isStaticFile(string $path): bool {
    global $mimeTypes;
    
    // Get absolute path to public directory
    $publicPath = __DIR__ . '/public';
    $filePath = $publicPath . '/' . $path;
    
    // Basic path validation
    if (!is_file($filePath) || !is_readable($filePath)) {
        return false;
    }
    
    // Verify file is within public directory
    if (strpos(realpath($filePath), realpath($publicPath)) !== 0) {
        return false;
    }
    
    // Validate file extension
    $extension = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
    return isset($mimeTypes[$extension]);
}

/**
 * Serve static file with proper headers
 *
 * @param string $path File path
 * @return void
 */
function serveStaticFile(string $path): void {
    global $mimeTypes, $securityHeaders;
    
    $publicPath = __DIR__ . '/public';
    $filePath = $publicPath . '/' . $path;
    
    // Set content type header
    $extension = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
    header('Content-Type: ' . $mimeTypes[$extension]);
    
    // Set security headers
    foreach ($securityHeaders as $header => $value) {
        header("$header: $value");
    }
    
    // Set cache control headers
    header('Cache-Control: public, max-age=31536000');
    header('Expires: ' . gmdate('D, d M Y H:i:s \G\M\T', time() + 31536000));
    
    // Output file contents
    readfile($filePath);
}

/**
 * Set security headers for all responses
 */
function setSecurityHeaders(): void {
    global $securityHeaders;
    foreach ($securityHeaders as $header => $value) {
        header("$header: $value");
    }
}

// Parse request URI
$uri = parseUri($_SERVER['REQUEST_URI']);

// Set security headers for all responses
setSecurityHeaders();

// Check for static file
if ($uri !== '/' && isStaticFile($uri)) {
    serveStaticFile($uri);
    exit;
}

// Route all other requests to Laravel
require_once __DIR__ . '/public/index.php';