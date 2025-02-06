<?php

use Illuminate\Support\Env;

return [
    /*
    |--------------------------------------------------------------------------
    | Default Queue Connection Name
    |--------------------------------------------------------------------------
    |
    | Laravel's queue API supports a variety of backends via a unified API,
    | giving you convenient access to each backend using the same syntax.
    | Here you may define a default connection for the healthcare platform.
    |
    */

    'default' => env('QUEUE_CONNECTION', 'redis'),

    /*
    |--------------------------------------------------------------------------
    | Queue Connections
    |--------------------------------------------------------------------------
    |
    | Here you may configure the connection information for each server that
    | is used by your application. A default configuration has been added
    | for each backend supported by Laravel. You may add more here.
    |
    */

    'connections' => [
        // Synchronous driver for local development and testing
        'sync' => [
            'driver' => 'sync',
        ],

        // Redis queue driver with HIPAA-compliant configuration
        'redis' => [
            'driver' => 'redis',
            'connection' => 'default',
            'queue' => 'default',
            'retry_after' => 600, // 10 minutes timeout for stuck jobs
            'block_for' => 5, // Wait 5 seconds for jobs when polling
            'after_commit' => true, // Process jobs only after DB commits
            'prefix' => 'health_enrollment:', // Namespace for queue keys
            'retry_attempts' => 3, // Maximum retry attempts for failed jobs
            'timeout' => 120, // Job timeout in seconds
            
            // Rate limiting configuration
            'throttle' => [
                'enabled' => true,
                'attempts' => 5, // Maximum attempts per time window
                'release_after' => 300, // Release after 5 minutes
            ],
            
            // PHI data encryption configuration
            'encryption' => [
                'enabled' => true,
                'key' => env('QUEUE_ENCRYPTION_KEY'),
            ],
        ],

        // AWS SQS configuration for high availability
        'sqs' => [
            'driver' => 'sqs',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'prefix' => env('SQS_PREFIX', 'https://sqs.us-east-1.amazonaws.com/your-account-id'),
            'queue' => env('SQS_QUEUE', 'health-enrollment'),
            'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
            'after_commit' => true,
            'visibility_timeout' => 300, // 5 minutes processing window
            'message_retention' => 1209600, // 14 days retention
            'wait_time' => 20, // Long polling wait time
            'batch_size' => 10, // Number of messages to fetch per request
            
            // AWS resource tagging
            'tags' => [
                'Environment' => env('APP_ENV'),
                'Service' => 'health-enrollment',
            ],
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Failed Queue Jobs
    |--------------------------------------------------------------------------
    |
    | These options configure the behavior of failed queue job logging and
    | notification. You may change them to any database / table which
    | makes sense in your application's context.
    |
    */

    'failed' => [
        'driver' => 'database-uuids',
        'database' => 'mysql',
        'table' => 'failed_jobs',
        'retention_days' => 30, // Keep failed jobs for 30 days
        
        // Failure notifications
        'notify' => [
            'channels' => ['slack', 'email'],
            'threshold' => 5, // Notify after 5 failures
        ],
        
        'retry_after' => 3600, // Retry failed jobs after 1 hour
    ],

    /*
    |--------------------------------------------------------------------------
    | Queue Batching
    |--------------------------------------------------------------------------
    |
    | The following options configure the database and table that store job
    | batching information. These options can be updated to any database
    | connection and table which makes sense for your application.
    |
    */

    'batching' => [
        'database' => 'mysql',
        'table' => 'job_batches',
        'retention_days' => 7, // Keep batch records for 7 days
        'connection' => 'default',
    ],

    /*
    |--------------------------------------------------------------------------
    | Queue Monitoring
    |--------------------------------------------------------------------------
    |
    | Here you may configure queue monitoring settings including metrics
    | collection and alerting thresholds for the healthcare platform.
    |
    */

    'monitoring' => [
        'enabled' => true,
        'metrics' => [
            'queue_size',
            'processing_time',
            'failure_rate',
        ],
        'alert_thresholds' => [
            'queue_size' => 1000, // Alert when queue exceeds 1000 jobs
            'processing_time' => 300, // Alert on jobs taking > 5 minutes
            'failure_rate' => 0.05, // Alert on > 5% failure rate
        ],
    ],
];