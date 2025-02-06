<?php

namespace App\Http\Middleware;

use Illuminate\Cookie\Middleware\EncryptCookies as Middleware;

/**
 * Cookie encryption middleware for AUSTA Integration Platform
 * 
 * Implements AES-256-GCM encryption for secure cookie handling as part of the
 * zero-trust security framework. Ensures HIPAA, GDPR, and LGPD compliance
 * for sensitive session data transmission.
 * 
 * @package App\Http\Middleware
 * @version 1.0.0
 * @uses laravel/framework ^9.0
 */
class EncryptCookies extends Middleware
{
    /**
     * The names of the cookies that should not be encrypted.
     * 
     * Empty array by default to ensure maximum security for all cookies
     * in compliance with healthcare data protection requirements.
     *
     * @var array<int, string>
     */
    protected $except = [];
}