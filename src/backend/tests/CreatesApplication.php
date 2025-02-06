<?php

namespace Tests;

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;

/**
 * CreatesApplication Trait
 * 
 * Provides secure and compliant application bootstrapping functionality for test cases
 * in the AUSTA Integration Platform with enhanced security controls and monitoring.
 *
 * @package Tests
 * @version 1.0.0
 */
trait CreatesApplication
{
    /**
     * Test environment configuration
     */
    protected array $testConfig = [
        'database' => [
            'use_test_database' => true,
            'enforce_isolation' => true
        ],
        'security' => [
            'enforce_encryption' => true,
            'validate_ssl' => true,
            'audit_logging' => true
        ],
        'monitoring' => [
            'track_coverage' => true,
            'measure_performance' => true
        ]
    ];

    /**
     * Creates and bootstraps a fresh Laravel application instance for testing purposes
     * with security controls and compliance monitoring.
     *
     * @return \Illuminate\Foundation\Application
     */
    public function createApplication(): Application
    {
        try {
            // Initialize application with base path
            $app = require __DIR__.'/../bootstrap/app.php';

            // Configure test environment
            $this->configureTestEnvironment($app);

            // Bootstrap application
            $app->make(Kernel::class)->bootstrap();

            // Configure security settings
            $this->configureTestSecurity($app);

            // Set up test monitoring
            $this->configureTestMonitoring($app);

            // Initialize test database
            $this->initializeTestDatabase($app);

            // Configure test caching
            $this->configureTestCaching($app);

            // Log application creation
            Log::channel('testing')->info('Test application created', [
                'test_class' => get_class($this),
                'environment' => app()->environment(),
                'database' => config('database.default')
            ]);

            return $app;

        } catch (\Throwable $e) {
            Log::channel('testing')->error('Test application creation failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            throw $e;
        }
    }

    /**
     * Configure test environment settings.
     *
     * @param \Illuminate\Foundation\Application $app
     * @return void
     */
    protected function configureTestEnvironment(Application $app): void
    {
        // Load test environment file
        $app->loadEnvironmentFrom('.env.testing');

        // Set test environment
        $app['env'] = 'testing';

        // Configure test providers
        $app->register(\Tests\Providers\TestServiceProvider::class);

        // Set test URLs
        Config::set('app.url', 'http://localhost');
        Config::set('app.asset_url', 'http://localhost');
    }

    /**
     * Configure security settings for test environment.
     *
     * @param \Illuminate\Foundation\Application $app
     * @return void
     */
    protected function configureTestSecurity(Application $app): void
    {
        // Set test encryption key
        $app['config']->set('app.key', 'base64:'.base64_encode(random_bytes(32)));

        // Configure test hashing
        Hash::setRounds(4);

        // Set up test authentication
        Config::set('auth.defaults.guard', 'test');
        Config::set('auth.guards.test', [
            'driver' => 'session',
            'provider' => 'test_users'
        ]);

        // Configure test SSL settings
        if ($this->testConfig['security']['validate_ssl']) {
            Config::set('app.ssl_verification', true);
        }
    }

    /**
     * Configure test monitoring and metrics collection.
     *
     * @param \Illuminate\Foundation\Application $app
     * @return void
     */
    protected function configureTestMonitoring(Application $app): void
    {
        if ($this->testConfig['monitoring']['track_coverage']) {
            // Configure code coverage tracking
            $app->singleton('coverage', function ($app) {
                return new \Tests\Support\Coverage\CoverageService();
            });
        }

        // Configure test logging
        $app->configureMonologUsing(function ($monolog) {
            $monolog->pushHandler(new \Monolog\Handler\TestHandler());
        });

        // Set up test metrics collection
        if ($this->testConfig['monitoring']['measure_performance']) {
            $app->singleton('metrics', function ($app) {
                return new \Tests\Support\Metrics\TestMetricsCollector();
            });
        }
    }

    /**
     * Initialize and configure test database.
     *
     * @param \Illuminate\Foundation\Application $app
     * @return void
     */
    protected function initializeTestDatabase(Application $app): void
    {
        if ($this->testConfig['database']['use_test_database']) {
            // Configure test database connection
            Config::set('database.default', 'sqlite');
            Config::set('database.connections.sqlite', [
                'driver' => 'sqlite',
                'database' => ':memory:',
                'prefix' => '',
            ]);

            // Enable database query logging for tests
            Config::set('database.logging', true);
        }

        if ($this->testConfig['database']['enforce_isolation']) {
            // Configure database transaction isolation
            $app->singleton('db.transactions', function ($app) {
                return new \Tests\Support\Database\TransactionManager();
            });
        }
    }

    /**
     * Configure test caching settings.
     *
     * @param \Illuminate\Foundation\Application $app
     * @return void
     */
    protected function configureTestCaching(Application $app): void
    {
        // Use array driver for testing
        Config::set('cache.default', 'array');

        // Clear existing cache
        Cache::flush();

        // Configure test-specific cache settings
        Config::set('cache.stores.array', [
            'driver' => 'array',
            'serialize' => false,
        ]);
    }
}