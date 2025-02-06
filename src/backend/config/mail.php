<?php

// Laravel Mail Configuration v9.0
// AWS SES Integration with Multi-language Support

return [
    /*
    |--------------------------------------------------------------------------
    | Default Mailer
    |--------------------------------------------------------------------------
    |
    | This option controls the default mailer that is used to send any email
    | messages sent by your application. Alternative mailers may be setup
    | and used as needed; however, this mailer will be used by default.
    |
    */
    'default' => env('MAIL_MAILER', 'ses'),

    /*
    |--------------------------------------------------------------------------
    | Mailer Configurations
    |--------------------------------------------------------------------------
    |
    | Here you may configure all of the mailers used by your application plus
    | their respective settings. Several examples have been configured for
    | you and you are free to add your own as your application requires.
    |
    */
    'mailers' => [
        'ses' => [
            'transport' => 'ses',
            'region' => env('AWS_SES_REGION', 'us-east-1'),
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'version' => 'latest',
            'configuration_set' => env('AWS_SES_CONFIGURATION_SET', 'austa-health'),
            'verify_ssl' => true,
        ],

        'smtp' => [
            'transport' => 'smtp',
            'host' => env('MAIL_HOST', 'smtp.mailgun.org'),
            'port' => env('MAIL_PORT', 587),
            'encryption' => env('MAIL_ENCRYPTION', 'tls'),
            'username' => env('MAIL_USERNAME'),
            'password' => env('MAIL_PASSWORD'),
            'timeout' => 30,
            'verify_peer' => true,
            'local_domain' => env('MAIL_EHLO_DOMAIN', 'austa.health'),
        ],

        'log' => [
            'transport' => 'log',
            'channel' => env('MAIL_LOG_CHANNEL', 'stack'),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Global "From" Address
    |--------------------------------------------------------------------------
    |
    | You may wish for all e-mails sent by your application to be sent from
    | the same address. Here, you may specify a name and address that is
    | used globally for all e-mails that are sent by your application.
    |
    */
    'from' => [
        'address' => env('MAIL_FROM_ADDRESS', 'noreply@austa.health'),
        'name' => env('MAIL_FROM_NAME', 'AUSTA Integration Platform'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Global "Reply-To" Address
    |--------------------------------------------------------------------------
    |
    | Here you may specify the reply-to address that is used for all emails
    | sent by your application. This ensures proper routing of customer
    | responses to the support team.
    |
    */
    'reply_to' => [
        'address' => env('MAIL_REPLY_TO_ADDRESS', 'support@austa.health'),
        'name' => env('MAIL_REPLY_TO_NAME', 'AUSTA Support'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Markdown Mail Settings
    |--------------------------------------------------------------------------
    |
    | If you are using Markdown based email rendering, you may configure your
    | theme and component paths here, allowing you to customize the design
    | of the emails. Also, you may set the paths for multi-language support.
    |
    */
    'markdown' => [
        'theme' => 'default',
        'paths' => [
            'resources/views/vendor/mail/en',
            'resources/views/vendor/mail/pt',
        ],
        'customizations' => [
            'colors' => [
                'primary' => '#2196F3',
                'secondary' => '#FF4081',
            ],
            'fonts' => [
                'family' => 'Roboto, sans-serif',
            ],
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Mail Logging Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure the logging settings for your email communications.
    | This allows for comprehensive tracking and compliance monitoring of all
    | sent emails while protecting sensitive information.
    |
    */
    'logging' => [
        'enabled' => true,
        'channel' => env('MAIL_LOG_CHANNEL', 'mail'),
        'retention_days' => 90,
        'include_sensitive' => false,
        'track_opens' => true,
        'track_clicks' => true,
    ],

    /*
    |--------------------------------------------------------------------------
    | Queue Configuration
    |--------------------------------------------------------------------------
    |
    | Configure the queueing behavior for email processing. This ensures reliable
    | delivery and proper handling of high email volumes without impacting
    | application performance.
    |
    */
    'queue' => [
        'enabled' => true,
        'connection' => env('MAIL_QUEUE_CONNECTION', 'redis'),
        'queue' => env('MAIL_QUEUE_NAME', 'emails'),
        'tries' => 3,
        'timeout' => 60,
        'retry_after' => 180,
        'block_for' => 5,
        'max_exceptions' => 3,
    ],

    /*
    |--------------------------------------------------------------------------
    | Rate Limiting
    |--------------------------------------------------------------------------
    |
    | Configure rate limiting for email sending to prevent abuse and ensure
    | compliance with email service provider limits. This helps maintain
    | high deliverability rates.
    |
    */
    'rate_limiting' => [
        'enabled' => true,
        'max_per_second' => 50,
        'max_per_minute' => 2000,
    ],
];