<?php
header('Content-Type: application/json');

// Simple API simulation for testing
$routes = [
    '/api/health' => [
        'status' => 'healthy',
        'services' => [
            'web' => 'running',
            'db' => 'connected',
            'cache' => 'available'
        ]
    ],
    '/api/users' => [
        'data' => [
            ['id' => 1, 'name' => 'John Doe', 'email' => 'john@example.com'],
            ['id' => 2, 'name' => 'Jane Smith', 'email' => 'jane@example.com'],
        ],
        'meta' => [
            'total' => 2
        ]
    ],
    '/api/config' => [
        'app_name' => 'AUSTA Integration Platform',
        'environment' => 'testing',
        'version' => '1.0.0'
    ]
];

// Get the requested path or default to /api/health
$path = $_GET['path'] ?? '/api/health';

// Return the appropriate mock response
if (isset($routes[$path])) {
    echo json_encode($routes[$path], JSON_PRETTY_PRINT);
} else {
    http_response_code(404);
    echo json_encode(['error' => 'Route not found'], JSON_PRETTY_PRINT);
}
