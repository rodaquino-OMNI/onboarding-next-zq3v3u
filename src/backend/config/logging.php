<?php

use Monolog\Handler\StreamHandler;
use Monolog\Handler\SyslogHandler;
use Monolog\Formatter\JsonFormatter;
use AWS\CloudWatch\CloudWatchLoggerFactory;

return [
    /*
    |--------------------------------------------------------------------------
    | Default Log Channel
    |--------------------------------------------------------------------------
    |
    | This option defines the default log channel that gets used when writing
    | messages to the logs. The name specified in this option should match
    | one of the channels defined in the "channels" configuration array.
    |
    */

    'default' => env('LOG_CHANNEL', 'stack'),

    /*
    |--------------------------------------------------------------------------
    | Deprecations Log Channel
    |--------------------------------------------------------------------------
    |
    | This option controls the log channel that should be used to log warnings
    | regarding deprecated PHP and library features. This allows you to get
    | your application ready for upcoming major versions of dependencies.
    |
    */

    'deprecations' => [
        'channel' => env('LOG_DEPRECATIONS_CHANNEL', 'null'),
        'trace' => false,
    ],

    /*
    |--------------------------------------------------------------------------
    | Log Channels
    |--------------------------------------------------------------------------
    |
    | Here you may configure the log channels for your application. Laravel uses
    | the Monolog PHP logging library, which provides support for a variety of 
    | powerful log handlers / formatters.
    |
    | Available Drivers: "single", "daily", "slack", "syslog",
    |                    "errorlog", "monolog", "custom", "stack"
    |
    */

    'channels' => [
        'stack' => [
            'driver' => 'stack',
            'channels' => ['daily', 'cloudwatch', 'syslog'],
            'ignore_exceptions' => false,
            'permission' => 0640,
            'bubble' => true,
        ],

        'daily' => [
            'driver' => 'daily',
            'path' => storage_path('logs/laravel.log'),
            'level' => env('LOG_LEVEL', 'debug'),
            'days' => env('LOG_RETENTION_DAYS', 14),
            'permission' => 0640,
            'formatter' => JsonFormatter::class,
            'formatter_with' => [
                'dateFormat' => 'Y-m-d H:i:s.u',
                'appendNewline' => true,
                'includeStacktraces' => true,
            ],
        ],

        'cloudwatch' => [
            'driver' => 'custom',
            'via' => CloudWatchLoggerFactory::class,
            'formatter' => JsonFormatter::class,
            'name' => env('AWS_CLOUDWATCH_GROUP', 'austa-integration-platform'),
            'group' => 'production',
            'retention' => env('LOG_RETENTION_DAYS', 14),
            'region' => env('AWS_CLOUDWATCH_REGION', 'sa-east-1'),
            'stream_name' => '{date}-{environment}',
            'batch_size' => 10000,
            'version' => '1.0',
        ],

        'syslog' => [
            'driver' => 'syslog',
            'facility' => 'local6',
            'formatter' => JsonFormatter::class,
            'level' => 'info',
            'ident' => 'austa-platform',
            'logopts' => ['PID', 'NDELAY'],
            'formatter_with' => [
                'maxLength' => 32768,
                'includeStacktraces' => true,
            ],
        ],

        'audit' => [
            'driver' => 'daily',
            'path' => storage_path('logs/audit/audit.log'),
            'level' => 'info',
            'days' => 365,
            'permission' => 0600,
            'formatter' => JsonFormatter::class,
            'formatter_with' => [
                'dateFormat' => 'Y-m-d H:i:s.u',
                'includeStacktraces' => true,
                'maxLength' => 32768,
            ],
        ],

        'hipaa' => [
            'driver' => 'daily',
            'path' => storage_path('logs/hipaa/access.log'),
            'level' => 'info',
            'days' => 365,
            'permission' => 0600,
            'formatter' => JsonFormatter::class,
            'formatter_with' => [
                'dateFormat' => 'Y-m-d H:i:s.u',
                'includeStacktraces' => true,
                'maxLength' => 32768,
            ],
        ],

        'security' => [
            'driver' => 'daily',
            'path' => storage_path('logs/security/events.log'),
            'level' => 'info',
            'days' => 365,
            'permission' => 0600,
            'formatter' => JsonFormatter::class,
            'formatter_with' => [
                'dateFormat' => 'Y-m-d H:i:s.u',
                'includeStacktraces' => true,
                'maxLength' => 32768,
            ],
        ],

        'emergency' => [
            'driver' => 'daily',
            'path' => storage_path('logs/emergency.log'),
            'level' => 'emergency',
            'days' => 30,
            'permission' => 0640,
            'formatter' => JsonFormatter::class,
            'formatter_with' => [
                'dateFormat' => 'Y-m-d H:i:s.u',
                'includeStacktraces' => true,
            ],
        ],

        'fhir-audit' => [
            'driver' => 'daily',
            'path' => storage_path('logs/fhir/audit.log'),
            'level' => 'info',
            'days' => 365,
            'permission' => 0600,
            'formatter' => JsonFormatter::class,
            'formatter_with' => [
                'dateFormat' => 'Y-m-d H:i:s.u',
                'includeStacktraces' => true,
                'maxLength' => 32768,
            ],
        ],
    ],
];