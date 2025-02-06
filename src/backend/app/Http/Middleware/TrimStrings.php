<?php

namespace App\Http\Middleware;

use Illuminate\Foundation\Http\Middleware\TrimStrings as Middleware;

/**
 * Middleware for automatically trimming whitespace from request string values
 * while preserving specific fields that require exact string preservation.
 *
 * @package App\Http\Middleware
 * @version 9.0.0
 * @see \Illuminate\Foundation\Http\Middleware\TrimStrings
 */
class TrimStrings extends Middleware
{
    /**
     * The names of the attributes that should not be trimmed.
     *
     * @var array<int, string>
     */
    protected $except = [
        // Authentication & Security Fields
        'password',
        'password_confirmation',
        'current_password',
        
        // Encrypted Data Fields
        'encrypted_*',
        
        // Security Tokens & Signatures
        '*_token',
        '*_signature',
        'jwt_*',
        
        // API & Secret Keys
        'api_key',
        'secret_*',
        
        // Encoded Data Fields
        'base64_*',
    ];
}