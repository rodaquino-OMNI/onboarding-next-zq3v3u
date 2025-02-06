<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Default Broadcaster
    |--------------------------------------------------------------------------
    |
    | This option controls the default broadcaster that will be used by the
    | framework when an event needs to be broadcast. You may set this to
    | any of the connections defined in the "connections" array below.
    |
    | Supported: "pusher", "redis", "log", "null"
    |
    */

    'default' => env('BROADCAST_DRIVER', 'pusher'),

    /*
    |--------------------------------------------------------------------------
    | Broadcast Connections
    |--------------------------------------------------------------------------
    |
    | Here you may define all of the broadcast connections that will be used
    | to broadcast events to other systems or over websockets. Samples of
    | each available type of connection are provided inside this array.
    |
    */

    'connections' => [
        'pusher' => [
            'driver' => 'pusher',
            'key' => env('PUSHER_APP_KEY'),
            'secret' => env('PUSHER_APP_SECRET'),
            'app_id' => env('PUSHER_APP_ID'),
            'options' => [
                'cluster' => env('PUSHER_APP_CLUSTER'),
                'host' => env('PUSHER_HOST'),
                'port' => env('PUSHER_PORT', 443),
                'scheme' => env('PUSHER_SCHEME', 'https'),
                'encrypted' => true,
                'useTLS' => true,
                'timeout' => 30,
                'keepalive' => true,
                'gzip' => true,
                'retry_after' => 3000,
                'max_retries' => 3,
                'activity_timeout' => 120,
                'pong_timeout' => 30,
                'debug' => false,
                'tls' => [
                    'verify_peer' => true,
                    'verify_peer_name' => true,
                    'allow_self_signed' => false,
                    'cafile' => env('PUSHER_CA_FILE'),
                ],
                'rate_limiting' => [
                    'max_connections' => 1000,
                    'max_client_events' => 100,
                    'max_presence_members' => 100
                ],
                'presence' => [
                    'user_authentication' => true,
                    'max_members' => 100,
                    'timeout' => 60
                ]
            ],
        ],

        'redis' => [
            'driver' => 'redis',
            'connection' => 'default',
            'queue' => 'broadcasting',
            'prefix' => 'austa_broadcast:',
            'retry_after' => 3000,
            'block_for' => 5,
            'after_commit' => true,
            'pool' => [
                'min_connections' => 5,
                'max_connections' => 50,
                'timeout' => 30,
                'retry_interval' => 3,
                'max_retries' => 3
            ],
            'options' => [
                'cluster' => true,
                'prefix' => env('REDIS_PREFIX', 'austa_broadcast:'),
                'read_write_timeout' => 0,
                'persistent' => true,
                'keepalive' => -1
            ]
        ],

        'log' => [
            'driver' => 'log',
            'channel' => env('LOG_CHANNEL', 'broadcasting'),
            'level' => env('LOG_LEVEL', 'debug'),
            'path' => storage_path('logs/broadcasting.log'),
            'days' => 14
        ],

        'null' => [
            'driver' => 'null'
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Broadcast Security Settings
    |--------------------------------------------------------------------------
    |
    | Security configuration for broadcast channels including encryption,
    | authentication and rate limiting settings.
    |
    */
    
    'security' => [
        'encryption' => [
            'enabled' => true,
            'algorithm' => 'aes-256-gcm',
            'key' => env('BROADCAST_ENCRYPTION_KEY'),
        ],
        'authentication' => [
            'timeout' => 300,
            'max_attempts' => 5,
            'block_duration' => 300
        ],
        'rate_limiting' => [
            'enabled' => true,
            'max_attempts' => 100,
            'decay_minutes' => 1
        ]
    ],

    /*
    |--------------------------------------------------------------------------
    | Channel Authorization Routes
    |--------------------------------------------------------------------------
    |
    | Here you may register the routes needed for channel authorization.
    | These routes are loaded by the BroadcastServiceProvider.
    |
    */

    'routes' => [
        'prefix' => 'broadcasting',
        'middleware' => ['web', 'auth:sanctum', 'audit.log'],
        'namespace' => 'App\\Http\\Controllers',
        'domain' => null,
    ],

    /*
    |--------------------------------------------------------------------------
    | Broadcast Event Mapping
    |--------------------------------------------------------------------------
    |
    | You may register event-channel mappings here. Events will automatically
    | be broadcast on their corresponding channels when dispatched.
    |
    */

    'events' => [
        'App\\Events\\InterviewStatusUpdated' => [
            'private-interview.{interviewId}'
        ],
        'App\\Events\\EnrollmentStatusUpdated' => [
            'private-enrollment.{enrollmentId}'
        ],
        'App\\Events\\DocumentProcessed' => [
            'private-enrollment.{enrollmentId}'
        ],
    ],
];