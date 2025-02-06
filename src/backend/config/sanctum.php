<?php

use Laravel\Sanctum\PersonalAccessToken; // Laravel Sanctum ^3.0

return [
    /*
    |--------------------------------------------------------------------------
    | Stateful Domains
    |--------------------------------------------------------------------------
    |
    | Listed domains will maintain session state between requests. Domains are
    | strictly controlled for HIPAA compliance and zero-trust security model.
    | Only trusted application domains should be listed here.
    |
    */
    'stateful' => explode(',', env('SANCTUM_STATEFUL_DOMAINS', sprintf(
        '%s%s%s',
        'localhost,localhost:3000,127.0.0.1,127.0.0.1:8000,::1',
        env('APP_URL') ? ','.parse_url(env('APP_URL'), PHP_URL_HOST) : '',
        env('FRONTEND_URL') ? ','.parse_url(env('FRONTEND_URL'), PHP_URL_HOST) : ''
    ))),

    /*
    |--------------------------------------------------------------------------
    | Sanctum Guards
    |--------------------------------------------------------------------------
    |
    | Authentication guards used for token verification. Web guard is used for
    | maintaining secure session state in the healthcare enrollment system.
    |
    */
    'guard' => ['web'],

    /*
    |--------------------------------------------------------------------------
    | Expiration Minutes
    |--------------------------------------------------------------------------
    |
    | Token lifetime set to 60 minutes for HIPAA compliance and security best
    | practices. This helps minimize the risk of unauthorized access through
    | token compromise.
    |
    */
    'expiration' => 60,

    /*
    |--------------------------------------------------------------------------
    | Token Model
    |--------------------------------------------------------------------------
    |
    | Specifies the Sanctum token model for managing API authentication tokens
    | with built-in security features for the healthcare enrollment platform.
    |
    */
    'model' => PersonalAccessToken::class,

    /*
    |--------------------------------------------------------------------------
    | Middleware Configuration
    |--------------------------------------------------------------------------
    |
    | Security middleware stack for request verification, cookie encryption,
    | and CORS handling in the zero-trust architecture implementation.
    |
    */
    'middleware' => [
        'verify_csrf_token' => Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful::class,
        'encrypt_cookies' => App\Http\Middleware\EncryptCookies::class,
        'verify_cors' => App\Http\Middleware\HandleCors::class,
    ],

    /*
    |--------------------------------------------------------------------------
    | API Route Prefix
    |--------------------------------------------------------------------------
    |
    | Prefix for all Sanctum-protected API routes. Maintains consistent
    | versioning and routing structure across the enrollment platform.
    |
    */
    'prefix' => 'api',

    /*
    |--------------------------------------------------------------------------
    | Token Abilities
    |--------------------------------------------------------------------------
    |
    | Define granular token permissions for role-based access control (RBAC)
    | in alignment with HIPAA security requirements.
    |
    */
    'abilities' => [
        'enrollment:read',
        'enrollment:write',
        'documents:read',
        'documents:write',
        'interviews:manage',
        'admin:full',
    ],

    /*
    |--------------------------------------------------------------------------
    | Token Sanctum Features
    |--------------------------------------------------------------------------
    |
    | Configure additional Sanctum features for enhanced security including
    | token encryption and refresh capabilities.
    |
    */
    'features' => [
        'encryption' => true,
        'refresh-tokens' => false, // Disabled for security - requires re-authentication
        'token-tracking' => true,
        'rate-limiting' => true,
    ],

    /*
    |--------------------------------------------------------------------------
    | Access Token Name
    |--------------------------------------------------------------------------
    |
    | Name for the access token used in API authentication headers following
    | security best practices.
    |
    */
    'token_name' => 'AUSTA-API-Token',
];