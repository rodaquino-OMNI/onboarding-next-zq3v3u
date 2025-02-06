<?php

namespace App\Http\Middleware;

use Illuminate\Foundation\Http\Middleware\PreventRequestsDuringMaintenance as Middleware;

/**
 * Middleware implementing zero-trust security controls for application maintenance mode.
 * Ensures critical system endpoints remain accessible while preventing general access
 * during maintenance windows.
 *
 * @package App\Http\Middleware
 * @version 1.0.0
 * 
 * @see \Illuminate\Foundation\Http\Middleware\PreventRequestsDuringMaintenance
 */
class PreventRequestsDuringMaintenance extends Middleware
{
    /**
     * URIs that should be accessible during application maintenance mode.
     * 
     * Critical endpoints that must remain available:
     * - Health check endpoint for infrastructure monitoring
     * - Webhook endpoints for maintaining system integrations
     *
     * @var array<int, string>
     */
    protected $except = [
        // System health monitoring endpoint
        '/api/v1/health-check',
        
        // Webhook endpoints for maintaining critical integrations
        '/api/v1/webhooks/*'
    ];
}