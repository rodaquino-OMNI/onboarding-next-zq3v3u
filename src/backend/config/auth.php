<?php

/**
 * Authentication Configuration for AUSTA Integration Platform
 * 
 * Implements zero-trust security framework with comprehensive authentication controls
 * including JWT tokens, secure session management, and role-based access control.
 * 
 * @package AUSTA
 * @version 1.0.0
 */

use App\Models\User;

return [

    /*
    |--------------------------------------------------------------------------
    | Authentication Defaults
    |--------------------------------------------------------------------------
    |
    | This option controls the default authentication "guard" and password
    | reset options for your application.
    |
    */

    'defaults' => [
        'guard' => 'web',
        'passwords' => 'users',
    ],

    /*
    |--------------------------------------------------------------------------
    | Authentication Guards
    |--------------------------------------------------------------------------
    |
    | Guards define how users are authenticated for different interfaces.
    | - web: Session-based authentication for web interface
    | - api: Token-based authentication using Laravel Sanctum
    |
    */

    'guards' => [
        'web' => [
            'driver' => 'session',
            'provider' => 'users',
        ],

        'api' => [
            'driver' => 'sanctum',
            'provider' => 'users',
            'hash' => true, // Enable token hashing for security
            'expiration' => 60, // Token expiration in minutes (1 hour)
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | User Providers
    |--------------------------------------------------------------------------
    |
    | Providers define how users are retrieved from your database or other
    | storage mechanisms used to store your user's data.
    |
    */

    'providers' => [
        'users' => [
            'driver' => 'eloquent',
            'model' => User::class,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Password Reset Settings
    |--------------------------------------------------------------------------
    |
    | Configure password reset tokens, expiration times, and throttling.
    | Implements HIPAA-compliant password policies.
    |
    */

    'passwords' => [
        'users' => [
            'provider' => 'users',
            'table' => 'password_resets',
            'expire' => 60, // Password reset link expiration in minutes
            'throttle' => 60, // Throttle reset attempts (1 per minute)
            'timeout' => 10080, // Force password change after 7 days (minutes)
            'history' => 5, // Number of previous passwords to prevent reuse
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Security Settings
    |--------------------------------------------------------------------------
    |
    | Additional security configurations for the authentication system.
    |
    */

    'security' => [
        'session' => [
            'lifetime' => 120, // Session lifetime in minutes
            'expire_on_close' => true, // Expire session when browser closes
            'encrypt' => true, // Encrypt session data
            'same_site' => 'lax', // SameSite cookie policy
        ],
        
        'lockout' => [
            'max_attempts' => User::MAX_LOGIN_ATTEMPTS, // From User model
            'decay_minutes' => 15, // Lockout duration in minutes
        ],

        'mfa' => [
            'enabled' => true, // Enable Multi-Factor Authentication
            'issuer' => 'AUSTA Platform', // TOTP issuer name
            'digits' => 6, // TOTP code length
            'window' => 1, // TOTP time window
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | API Settings
    |--------------------------------------------------------------------------
    |
    | Configuration for API authentication and token management.
    |
    */

    'api' => [
        'stateful' => explode(',', env('SANCTUM_STATEFUL_DOMAINS', sprintf(
            '%s%s',
            'localhost,localhost:3000,localhost:8080,127.0.0.1,127.0.0.1:8080,::1',
            env('APP_URL') ? ','.parse_url(env('APP_URL'), PHP_URL_HOST) : ''
        ))),
        
        'middleware' => [
            'verify_csrf_token' => \App\Http\Middleware\VerifyCsrfToken::class,
            'encrypt_cookies' => \App\Http\Middleware\EncryptCookies::class,
        ],

        'prefix' => 'api',
        'domain' => null,
        'expiration' => 60, // API token expiration in minutes
        'refresh_ttl' => 20160, // Refresh token TTL (14 days in minutes)
    ],

];