<?php

/**
 * Laravel Filesystem Configuration
 * 
 * This configuration file defines disk configurations for document storage,
 * including local and cloud storage options for the AUSTA Integration Platform
 * with multi-region support and enhanced security features.
 * 
 * @package illuminate/support ^9.0
 */

return [

    /*
    |--------------------------------------------------------------------------
    | Default Filesystem Disk
    |--------------------------------------------------------------------------
    |
    | Here you may specify the default filesystem disk that should be used
    | by the framework. The "local" disk, as well as a variety of cloud
    | based disks are available to your application for file storage.
    |
    */

    'default' => env('FILESYSTEM_DISK', 's3'),

    /*
    |--------------------------------------------------------------------------
    | Default Cloud Filesystem Disk
    |--------------------------------------------------------------------------
    |
    | Many applications store files both locally and in the cloud. For this
    | reason, you may specify a default "cloud" driver here. This driver
    | will be bound as the Cloud disk implementation in the container.
    |
    */

    'cloud' => env('FILESYSTEM_CLOUD', 's3'),

    /*
    |--------------------------------------------------------------------------
    | Filesystem Disks
    |--------------------------------------------------------------------------
    |
    | Here you may configure as many filesystem "disks" as you wish, and you
    | may even configure multiple disks of the same driver. Defaults have
    | been set up for each driver as an example of the required values.
    |
    */

    'disks' => [

        'local' => [
            'driver' => 'local',
            'root' => storage_path('app'),
            'throw' => false,
        ],

        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => env('APP_URL').'/storage',
            'visibility' => 'public',
            'throw' => false,
        ],

        's3' => [
            'driver' => 's3',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
            'bucket' => env('AWS_BUCKET'),
            'url' => env('AWS_URL'),
            'endpoint' => env('AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', false),
            'throw' => true,
            // Enhanced security configuration
            'encryption' => 'AES256',
            'versioning' => true,
            'server_side_encryption' => 'aws:kms',
            'kms_key_id' => env('AWS_KMS_KEY_ID'),
            // Lifecycle rules for cost optimization
            'lifecycle_rules' => [
                [
                    'enabled' => true,
                    'prefix' => 'documents/',
                    'transition' => [
                        'days' => 30,
                        'storage_class' => 'STANDARD_IA'
                    ]
                ],
                [
                    'enabled' => true,
                    'prefix' => 'archives/',
                    'transition' => [
                        'days' => 90,
                        'storage_class' => 'GLACIER'
                    ]
                ]
            ],
        ],

        'gcs' => [
            'driver' => 'gcs',
            'project_id' => env('GOOGLE_CLOUD_PROJECT_ID'),
            'key_file' => env('GOOGLE_CLOUD_KEY_FILE'),
            'bucket' => env('GOOGLE_CLOUD_STORAGE_BUCKET'),
            'path_prefix' => env('GOOGLE_CLOUD_STORAGE_PATH_PREFIX', null),
            'storage_api_uri' => env('GOOGLE_CLOUD_STORAGE_API_URI', null),
            'visibility' => 'private',
            'throw' => true,
            // Enhanced security configuration for GCS
            'encryption' => [
                'enabled' => true,
                'algorithm' => 'AES256',
                'kms_key_name' => env('GOOGLE_CLOUD_KMS_KEY_NAME')
            ],
            'uniform_bucket_level_access' => true,
            // Retention policy for compliance
            'retention_policy' => [
                'retention_period' => 2592000, // 30 days in seconds
                'is_locked' => false
            ],
        ],

    ],

];