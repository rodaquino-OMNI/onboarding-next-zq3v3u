<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Base TestCase for AUSTA Integration Platform
 * 
 * Provides comprehensive testing infrastructure with enhanced security,
 * HIPAA compliance, and proper test isolation features.
 *
 * @package Tests
 * @version 1.0.0
 */
abstract class TestCase extends BaseTestCase
{
    use CreatesApplication;

    /**
     * Run tests in separate processes for isolation
     *
     * @var bool
     */
    protected $runTestInSeparateProcess = true;

    /**
     * Preserve global state between tests
     *
     * @var bool
     */
    protected $preserveGlobalState = false;

    /**
     * Required security headers for HIPAA compliance
     *
     * @var array
     */
    protected array $securityHeaders = [
        'X-Content-Type-Options' => 'nosniff',
        'X-Frame-Options' => 'DENY',
        'X-XSS-Protection' => '1; mode=block',
        'Strict-Transport-Security' => 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy' => "default-src 'self'",
        'Cache-Control' => 'no-store, no-cache, must-revalidate, proxy-revalidate'
    ];

    /**
     * Test encryption keys
     *
     * @var array
     */
    protected array $encryptionKeys = [
        'test_key' => null,
        'test_cipher' => 'AES-256-GCM'
    ];

    /**
     * HIPAA compliance configuration
     *
     * @var array
     */
    protected array $complianceConfig = [
        'enforce_encryption' => true,
        'audit_logging' => true,
        'data_isolation' => true
    ];

    /**
     * Set up the test environment.
     *
     * @return void
     */
    protected function setUp(): void
    {
        parent::setUp();

        // Generate unique test encryption key
        $this->encryptionKeys['test_key'] = 'base64:' . base64_encode(Str::random(32));

        // Configure test environment
        $this->configureTestEnvironment();

        // Set up test database with encryption
        $this->configureTestDatabase();

        // Configure test security
        $this->configureTestSecurity();

        // Initialize test monitoring
        $this->configureTestMonitoring();

        // Set up audit logging for tests
        $this->configureAuditLogging();

        // Log test initialization
        Log::channel('testing')->info('Test environment initialized', [
            'test_class' => get_class($this),
            'test_id' => Str::uuid()->toString()
        ]);
    }

    /**
     * Clean up the testing environment before the next test.
     *
     * @return void
     */
    protected function tearDown(): void
    {
        // Verify test isolation
        $this->verifyTestIsolation();

        // Clean up test data
        $this->cleanupTestData();

        // Reset security configurations
        $this->resetSecurityConfig();

        // Clear test cache
        Cache::flush();

        // Log test completion
        Log::channel('testing')->info('Test environment cleaned up', [
            'test_class' => get_class($this),
            'memory_usage' => memory_get_usage(true)
        ]);

        parent::tearDown();
    }

    /**
     * Configure test environment settings.
     *
     * @return void
     */
    protected function configureTestEnvironment(): void
    {
        Config::set('app.env', 'testing');
        Config::set('app.debug', true);
        Config::set('app.key', $this->encryptionKeys['test_key']);
        
        // Configure test URLs
        Config::set('app.url', 'http://localhost');
        Config::set('app.asset_url', 'http://localhost');

        // Set test timezone
        date_default_timezone_set('UTC');
    }

    /**
     * Configure test database with encryption.
     *
     * @return void
     */
    protected function configureTestDatabase(): void
    {
        Config::set('database.default', 'sqlite');
        Config::set('database.connections.sqlite', [
            'driver' => 'sqlite',
            'database' => ':memory:',
            'prefix' => '',
            'foreign_key_constraints' => true
        ]);

        // Enable query logging for tests
        DB::enableQueryLog();
    }

    /**
     * Configure test security settings.
     *
     * @return void
     */
    protected function configureTestSecurity(): void
    {
        // Set test hashing rounds
        Hash::setRounds(4);

        // Configure test authentication
        Config::set('auth.defaults.guard', 'test');
        Config::set('auth.guards.test', [
            'driver' => 'session',
            'provider' => 'test_users'
        ]);

        // Set security headers
        foreach ($this->securityHeaders as $header => $value) {
            Config::set("security.headers.$header", $value);
        }
    }

    /**
     * Configure test monitoring and metrics.
     *
     * @return void
     */
    protected function configureTestMonitoring(): void
    {
        Config::set('logging.default', 'testing');
        Config::set('logging.channels.testing', [
            'driver' => 'single',
            'path' => storage_path('logs/testing.log'),
            'level' => 'debug',
        ]);

        // Configure test metrics collection
        if ($this->complianceConfig['audit_logging']) {
            Config::set('monitoring.metrics_enabled', true);
            Config::set('monitoring.tracing_enabled', true);
        }
    }

    /**
     * Configure audit logging for HIPAA compliance.
     *
     * @return void
     */
    protected function configureAuditLogging(): void
    {
        if ($this->complianceConfig['audit_logging']) {
            Config::set('logging.channels.audit', [
                'driver' => 'daily',
                'path' => storage_path('logs/audit.log'),
                'level' => 'info',
                'days' => 1
            ]);
        }
    }

    /**
     * Verify test isolation between runs.
     *
     * @return void
     */
    protected function verifyTestIsolation(): void
    {
        if ($this->complianceConfig['data_isolation']) {
            // Verify database isolation
            $this->assertEmpty(DB::getQueryLog(), 'Database queries leaked between tests');

            // Verify cache isolation
            $this->assertEmpty(Cache::tags(['test'])->get('*'), 'Cache data leaked between tests');
        }
    }

    /**
     * Clean up test data and resources.
     *
     * @return void
     */
    protected function cleanupTestData(): void
    {
        // Clean up database
        DB::rollBack();
        
        // Clear test cache
        Cache::tags(['test'])->flush();
        
        // Reset encryption keys
        $this->encryptionKeys['test_key'] = null;
    }

    /**
     * Reset security configurations.
     *
     * @return void
     */
    protected function resetSecurityConfig(): void
    {
        foreach ($this->securityHeaders as $header => $value) {
            Config::set("security.headers.$header", null);
        }
    }
}