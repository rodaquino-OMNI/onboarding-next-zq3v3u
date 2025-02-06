<?php

namespace App\Providers;

use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\Config;
use Illuminate\Encryption\Encrypter;
use Pusher\Pusher;

/**
 * BroadcastServiceProvider for AUSTA Integration Platform
 * 
 * Configures secure, HIPAA-compliant real-time event broadcasting for video interviews,
 * notifications, and system integrations with comprehensive audit logging and encryption.
 */
class BroadcastServiceProvider extends ServiceProvider
{
    /**
     * AES-256-GCM encryption key for channel messages
     *
     * @var string
     */
    protected $encryptionKey;

    /**
     * Security configuration for broadcasting
     *
     * @var array
     */
    protected $securityConfig = [
        'tls_version' => '1.3',
        'cipher_list' => 'TLS_AES_256_GCM_SHA384',
        'connection_timeout' => 30,
        'activity_timeout' => 120,
        'rate_limit' => 100,
        'max_connections' => 1000
    ];

    /**
     * Monitoring configuration for health checks
     *
     * @var array
     */
    protected $monitoringConfig = [
        'ping_interval' => 30,
        'connection_threshold' => 0.95,
        'latency_threshold' => 200,
        'error_threshold' => 0.01
    ];

    /**
     * Create a new service provider instance.
     *
     * @return void
     */
    public function __construct()
    {
        parent::__construct(app());

        // Initialize encryption key from environment
        $this->encryptionKey = env('BROADCAST_ENCRYPTION_KEY');

        // Validate encryption key length for AES-256
        if (strlen($this->encryptionKey) !== 32) {
            throw new \RuntimeException('Invalid broadcast encryption key length');
        }
    }

    /**
     * Bootstrap broadcasting services with enhanced security and monitoring.
     *
     * @return void
     */
    public function boot(): void
    {
        // Configure TLS/SSL for all WebSocket connections
        Config::set('broadcasting.connections.pusher.options.encrypted', true);
        Config::set('broadcasting.connections.pusher.options.tls', $this->securityConfig);

        // Initialize AES-256-GCM encryption for channel messages
        $encrypter = new Encrypter(
            $this->encryptionKey,
            'aes-256-gcm'
        );

        // Configure Pusher client with security settings
        $pusher = new Pusher(
            config('broadcasting.connections.pusher.key'),
            config('broadcasting.connections.pusher.secret'),
            config('broadcasting.connections.pusher.app_id'),
            [
                'cluster' => config('broadcasting.connections.pusher.options.cluster'),
                'encrypted' => true,
                'useTLS' => true,
                'timeout' => $this->securityConfig['connection_timeout'],
                'activity_timeout' => $this->securityConfig['activity_timeout'],
                'rate_limit' => $this->securityConfig['rate_limit'],
                'max_connections' => $this->securityConfig['max_connections']
            ]
        );

        // Set up connection monitoring
        $pusher->setLogger(app('log')->channel('broadcast'));

        // Register broadcast routes with authentication
        Broadcast::routes(['middleware' => ['auth:sanctum', 'audit.log']]);

        // Register channel authentication routes from channels.php
        require base_path('routes/channels.php');

        // Configure automatic reconnection with exponential backoff
        Config::set('broadcasting.connections.pusher.options.reconnection', [
            'enabled' => true,
            'max_attempts' => 5,
            'timeout_multiplier' => 2,
            'max_timeout' => 60
        ]);

        // Initialize metrics collection for monitoring
        $this->app->singleton('broadcast.monitor', function ($app) {
            return new \App\Services\BroadcastMonitor(
                $app['cache'],
                $this->monitoringConfig
            );
        });

        // Configure geographic routing based on user location
        Config::set('broadcasting.connections.pusher.options.geo_routing', [
            'enabled' => true,
            'default_region' => 'sa-east-1',
            'fallback_regions' => ['us-east-1']
        ]);

        // Set up DDoS protection with request filtering
        Config::set('broadcasting.connections.pusher.options.filter_options', [
            'rate_limit' => $this->securityConfig['rate_limit'],
            'concurrent_limit' => 10,
            'ip_whitelist' => config('broadcasting.whitelist', [])
        ]);

        // Configure channel cleanup for ended sessions
        Config::set('broadcasting.connections.pusher.options.channel_cleanup', [
            'enabled' => true,
            'inactive_timeout' => 300,
            'cleanup_interval' => 3600
        ]);

        // Register error handlers with automatic alerting
        $this->app['events']->listen('broadcasting.error', function ($error) {
            activity()
                ->withProperties([
                    'error' => $error->getMessage(),
                    'channel' => $error->channel ?? null,
                    'event' => $error->event ?? null
                ])
                ->log('broadcast_error');

            if ($error->severity === 'high') {
                app('alert')->critical('Broadcasting error: ' . $error->getMessage());
            }
        });
    }
}