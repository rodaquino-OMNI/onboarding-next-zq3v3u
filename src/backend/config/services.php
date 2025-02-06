<?php

// illuminate/support ^9.0
use Illuminate\Support\Env;

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials and configuration for third-party
    | services used by the AUSTA Integration Platform. These settings include
    | AWS services, Vonage video integration, and EMR system connectivity.
    |
    */

    'aws' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
        'bucket' => env('AWS_BUCKET'),

        'textract' => [
            'version' => '2018-06-27',
            'timeout' => 120, // seconds
            'retry_attempts' => 3,
            'async_polling_delay' => 5, // seconds between status checks
            'max_concurrent_jobs' => 10,
        ],

        'ses' => [
            'key' => env('AWS_SES_KEY'),
            'secret' => env('AWS_SES_SECRET'),
            'region' => env('AWS_SES_REGION', 'us-east-1'),
            'from_address' => env('MAIL_FROM_ADDRESS'),
            'from_name' => env('MAIL_FROM_NAME'),
        ],
    ],

    'vonage' => [
        'api_key' => env('VONAGE_API_KEY'),
        'api_secret' => env('VONAGE_API_SECRET'),
        'session_mode' => 'routed', // Ensures media routing through Vonage servers
        'archive_mode' => 'manual', // Allows manual control of session recording
        'timeout' => 60, // API request timeout in seconds
        'retry_attempts' => 2,
        'max_duration' => 3600, // Maximum session duration in seconds (1 hour)
        'recording_enabled' => true,
        'recording_storage' => 's3', // Store recordings in AWS S3
    ],

    'emr' => [
        'base_url' => env('EMR_API_BASE_URL'),
        'api_key' => env('EMR_API_KEY'),
        'api_secret' => env('EMR_API_SECRET'),
        'fhir_version' => '4.0.1', // FHIR specification version
        'timeout' => 30, // seconds
        'retry_attempts' => 3,
        'cache_ttl' => 3600, // Cache time-to-live in seconds
        'verify_ssl' => true, // Enforce SSL verification
        'max_concurrent_requests' => 5,
        'webhook_url' => env('EMR_WEBHOOK_URL'),
        'webhook_secret' => env('EMR_WEBHOOK_SECRET'),
    ],

];