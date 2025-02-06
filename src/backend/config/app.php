<?php

use Illuminate\Support\Facades\Facade;
use App\Providers\AppServiceProvider;

return [

    /*
    |--------------------------------------------------------------------------
    | Application Name
    |--------------------------------------------------------------------------
    |
    | This value is the name of your application. This value is used when the
    | framework needs to place the application's name in a notification or
    | any other location as required by the application or its packages.
    |
    */

    'name' => env('APP_NAME', 'AUSTA Integration Platform'),

    /*
    |--------------------------------------------------------------------------
    | Application Environment
    |--------------------------------------------------------------------------
    |
    | This value determines the "environment" your application is currently
    | running in. This may determine how you prefer to configure various
    | services the application utilizes. Set this in your ".env" file.
    |
    */

    'env' => env('APP_ENV', 'production'),

    /*
    |--------------------------------------------------------------------------
    | Application Debug Mode
    |--------------------------------------------------------------------------
    |
    | When your application is in debug mode, detailed error messages with
    | stack traces will be shown on every error that occurs within your
    | application. If disabled, a simple generic error page is shown.
    |
    */

    'debug' => (bool) env('APP_DEBUG', false),

    /*
    |--------------------------------------------------------------------------
    | Application URL
    |--------------------------------------------------------------------------
    |
    | This URL is used by the console to properly generate URLs when using
    | the Artisan command line tool. You should set this to the root of
    | your application so that it is used when running Artisan tasks.
    |
    */

    'url' => env('APP_URL', 'https://austa.healthcare'),

    'asset_url' => env('ASSET_URL'),

    /*
    |--------------------------------------------------------------------------
    | Application Timezone and Locale
    |--------------------------------------------------------------------------
    |
    | Here you may specify the default timezone and locale for your application.
    | The timezone is used for date/time operations while the locale determines
    | the default language settings.
    |
    */

    'timezone' => env('APP_TIMEZONE', 'America/Sao_Paulo'),

    'locale' => env('APP_LOCALE', 'pt-BR'),

    'fallback_locale' => env('APP_FALLBACK_LOCALE', 'en'),

    'faker_locale' => 'pt_BR',

    /*
    |--------------------------------------------------------------------------
    | Encryption Key
    |--------------------------------------------------------------------------
    |
    | This key is used by the Illuminate encrypter service and should be set
    | to a random, 32 character string, otherwise these encrypted strings
    | will not be safe. Please do this before deploying an application!
    |
    */

    'key' => env('APP_KEY'),

    'cipher' => env('CIPHER_ALGO', 'AES-256-GCM'),

    /*
    |--------------------------------------------------------------------------
    | Security Headers
    |--------------------------------------------------------------------------
    |
    | Security headers for HIPAA, GDPR and LGPD compliance.
    |
    */
    
    'security' => [
        'headers' => [
            'X-Frame-Options' => 'DENY',
            'X-Content-Type-Options' => 'nosniff',
            'X-XSS-Protection' => '1; mode=block',
            'Strict-Transport-Security' => 'max-age=31536000; includeSubDomains',
            'Content-Security-Policy' => "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';",
            'Referrer-Policy' => 'strict-origin-when-cross-origin',
            'Permissions-Policy' => 'camera=(), microphone=(), geolocation=()'
        ],
        'ssl_protocols' => ['TLSv1.2', 'TLSv1.3'],
        'minimum_key_length' => 256
    ],

    /*
    |--------------------------------------------------------------------------
    | Compliance Settings
    |--------------------------------------------------------------------------
    |
    | Configuration for healthcare compliance requirements
    |
    */

    'compliance' => [
        'hipaa' => [
            'enabled' => true,
            'audit_retention_days' => 365,
            'encryption' => [
                'algorithm' => 'AES-256-GCM',
                'key_rotation_days' => 90
            ]
        ],
        'gdpr' => [
            'enabled' => true,
            'data_retention_days' => 730,
            'consent_required' => true
        ],
        'lgpd' => [
            'enabled' => true,
            'data_protection_officer' => env('LGPD_DPO_EMAIL')
        ]
    ],

    /*
    |--------------------------------------------------------------------------
    | Autoloaded Service Providers
    |--------------------------------------------------------------------------
    |
    | The service providers listed here will be automatically loaded on the
    | request to your application. Feel free to add your own services to
    | this array to grant expanded functionality to your applications.
    |
    */

    'providers' => [
        // Laravel Framework Service Providers
        Illuminate\Auth\AuthServiceProvider::class,
        Illuminate\Broadcasting\BroadcastServiceProvider::class,
        Illuminate\Bus\BusServiceProvider::class,
        Illuminate\Cache\CacheServiceProvider::class,
        Illuminate\Foundation\Providers\ConsoleSupportServiceProvider::class,
        Illuminate\Cookie\CookieServiceProvider::class,
        Illuminate\Database\DatabaseServiceProvider::class,
        Illuminate\Encryption\EncryptionServiceProvider::class,
        Illuminate\Filesystem\FilesystemServiceProvider::class,
        Illuminate\Foundation\Providers\FoundationServiceProvider::class,
        Illuminate\Hashing\HashServiceProvider::class,
        Illuminate\Mail\MailServiceProvider::class,
        Illuminate\Notifications\NotificationServiceProvider::class,
        Illuminate\Pagination\PaginationServiceProvider::class,
        Illuminate\Pipeline\PipelineServiceProvider::class,
        Illuminate\Queue\QueueServiceProvider::class,
        Illuminate\Redis\RedisServiceProvider::class,
        Illuminate\Auth\Passwords\PasswordResetServiceProvider::class,
        Illuminate\Session\SessionServiceProvider::class,
        Illuminate\Translation\TranslationServiceProvider::class,
        Illuminate\Validation\ValidationServiceProvider::class,
        Illuminate\View\ViewServiceProvider::class,

        // Application Service Providers
        App\Providers\AppServiceProvider::class,
        App\Providers\AuthServiceProvider::class,
        App\Providers\EventServiceProvider::class,
        App\Providers\RouteServiceProvider::class,
        App\Providers\FortifyServiceProvider::class,
    ],

    /*
    |--------------------------------------------------------------------------
    | Class Aliases
    |--------------------------------------------------------------------------
    |
    | This array of class aliases will be registered when this application
    | is started. However, feel free to register as many as you wish as
    | the aliases are "lazy" loaded so they don't hinder performance.
    |
    */

    'aliases' => Facade::defaultAliases()->merge([
        // Custom Facades
    ])->toArray(),

    /*
    |--------------------------------------------------------------------------
    | Logging Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure the log settings for your application. Out of
    | the box, Laravel uses the Monolog PHP logging library. This gives
    | you a variety of powerful log handlers / formatters to utilize.
    |
    */

    'logging' => [
        'default' => env('LOG_CHANNEL', 'stack'),
        'deprecations' => env('LOG_DEPRECATIONS_CHANNEL', 'null'),
        'channels' => [
            'audit' => [
                'driver' => 'daily',
                'path' => storage_path('logs/audit/audit.log'),
                'level' => env('LOG_LEVEL', 'info'),
                'days' => 365,
                'permission' => 0600
            ],
            'hipaa' => [
                'driver' => 'daily',
                'path' => storage_path('logs/hipaa/access.log'),
                'level' => 'info',
                'days' => 365,
                'permission' => 0600
            ],
            'security' => [
                'driver' => 'daily',
                'path' => storage_path('logs/security/events.log'),
                'level' => 'info',
                'days' => 365,
                'permission' => 0600
            ]
        ]
    ],

    /*
    |--------------------------------------------------------------------------
    | Session Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure the session settings for your application.
    | These settings are security-hardened for healthcare applications.
    |
    */

    'session' => [
        'secure' => true,
        'http_only' => true,
        'same_site' => 'strict',
        'lifetime' => env('SESSION_LIFETIME', 120),
        'expire_on_close' => true,
        'encrypt' => true,
        'cookie' => env('SESSION_COOKIE', 'austa_session')
    ],

];