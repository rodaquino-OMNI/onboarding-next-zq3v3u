<?php
header('Content-Type: application/json');

// Create a simple response structure
$response = [
    'status' => 'success',
    'message' => 'Application is running',
    'environment' => [
        'php_version' => PHP_VERSION,
        'server' => $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown',
        'time' => date('Y-m-d H:i:s'),
        'docker' => 'Running in Docker container'
    ],
    'test_mode' => true
];

echo json_encode($response, JSON_PRETTY_PRINT);
