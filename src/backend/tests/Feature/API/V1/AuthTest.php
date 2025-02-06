<?php

namespace Tests\Feature\API\V1;

use Tests\TestCase;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

/**
 * Feature tests for authentication endpoints in AUSTA Integration Platform API V1
 * Tests JWT authentication, multi-language support, and zero-trust security implementation
 */
class AuthTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Base API endpoint for authentication
     */
    protected string $baseUrl = '/api/v1/auth';

    /**
     * Required security headers for HIPAA compliance
     */
    protected array $securityHeaders = [
        'X-Content-Type-Options',
        'X-Frame-Options',
        'X-XSS-Protection',
        'Strict-Transport-Security',
        'Content-Security-Policy',
        'Cache-Control'
    ];

    /**
     * Set up test environment
     */
    protected function setUp(): void
    {
        parent::setUp();

        // Configure test environment with encryption
        config(['auth.defaults.guard' => 'api']);
        config(['jwt.ttl' => 60]); // 1 hour token lifetime
        
        // Set up security headers
        foreach ($this->securityHeaders as $header) {
            config(["security.headers.$header" => true]);
        }

        // Configure rate limiting
        config(['auth.rate_limit' => [
            'max_attempts' => 5,
            'decay_minutes' => 1
        ]]);
    }

    /**
     * Test successful login with valid credentials
     */
    public function test_user_can_login_with_valid_credentials()
    {
        $user = User::factory()->create([
            'email' => 'test@example.com',
            'password' => Hash::make('password123'),
            'role' => 'individual'
        ]);

        $response = $this->postJson("{$this->baseUrl}/login", [
            'email' => 'test@example.com',
            'password' => 'password123'
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'status',
                'data' => [
                    'token',
                    'token_type',
                    'expires_in',
                    'user' => [
                        'id',
                        'email',
                        'role',
                        'language'
                    ]
                ]
            ]);

        // Verify token expiry
        $this->assertEquals(60, $response->json('data.expires_in'));

        // Verify security headers
        foreach ($this->securityHeaders as $header) {
            $this->assertTrue($response->headers->has($header));
        }

        // Verify audit log
        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $user->id,
            'action' => 'login',
            'status' => 'success'
        ]);
    }

    /**
     * Test failed login with invalid credentials
     */
    public function test_login_fails_with_invalid_credentials()
    {
        $response = $this->postJson("{$this->baseUrl}/login", [
            'email' => 'invalid@example.com',
            'password' => 'wrongpassword'
        ]);

        $response->assertStatus(401)
            ->assertJson([
                'status' => 'error',
                'errors' => [
                    [
                        'code' => 'AUTH_ERROR',
                        'message' => 'Invalid credentials'
                    ]
                ]
            ]);

        // Verify security headers
        foreach ($this->securityHeaders as $header) {
            $this->assertTrue($response->headers->has($header));
        }
    }

    /**
     * Test token refresh functionality
     */
    public function test_token_refresh()
    {
        $user = User::factory()->create();
        $token = auth()->login($user);

        $response = $this->postJson("{$this->baseUrl}/refresh", [], [
            'Authorization' => "Bearer {$token}"
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'status',
                'data' => [
                    'token',
                    'token_type',
                    'expires_in'
                ]
            ]);

        // Verify old token is invalidated
        $oldTokenResponse = $this->getJson('/api/v1/user', [
            'Authorization' => "Bearer {$token}"
        ]);
        $oldTokenResponse->assertStatus(401);
    }

    /**
     * Test rate limiting on login attempts
     */
    public function test_login_rate_limiting()
    {
        $attempts = 6; // Exceeds max_attempts
        
        for ($i = 0; $i < $attempts; $i++) {
            $response = $this->postJson("{$this->baseUrl}/login", [
                'email' => 'test@example.com',
                'password' => 'wrongpassword'
            ]);
        }

        $response->assertStatus(429)
            ->assertJson([
                'status' => 'error',
                'errors' => [
                    [
                        'code' => 'RATE_LIMIT_EXCEEDED',
                        'message' => 'Too many login attempts'
                    ]
                ]
            ]);
    }

    /**
     * Test multi-language support in authentication responses
     */
    public function test_multilanguage_support()
    {
        // Test Portuguese response
        $response = $this->postJson("{$this->baseUrl}/login", [
            'email' => 'invalid@example.com',
            'password' => 'wrongpassword'
        ], [
            'Accept-Language' => 'pt-BR'
        ]);

        $response->assertStatus(401)
            ->assertJson([
                'status' => 'error',
                'errors' => [
                    [
                        'code' => 'AUTH_ERROR',
                        'message' => 'Credenciais inválidas'
                    ]
                ]
            ]);

        // Test English response
        $response = $this->postJson("{$this->baseUrl}/login", [
            'email' => 'invalid@example.com',
            'password' => 'wrongpassword'
        ], [
            'Accept-Language' => 'en'
        ]);

        $response->assertStatus(401)
            ->assertJson([
                'status' => 'error',
                'errors' => [
                    [
                        'code' => 'AUTH_ERROR',
                        'message' => 'Invalid credentials'
                    ]
                ]
            ]);
    }

    /**
     * Test security headers implementation
     */
    public function test_security_headers()
    {
        $response = $this->postJson("{$this->baseUrl}/login", [
            'email' => 'test@example.com',
            'password' => 'password123'
        ]);

        $this->assertTrue($response->headers->has('X-Content-Type-Options'));
        $this->assertEquals('nosniff', $response->headers->get('X-Content-Type-Options'));

        $this->assertTrue($response->headers->has('X-Frame-Options'));
        $this->assertEquals('DENY', $response->headers->get('X-Frame-Options'));

        $this->assertTrue($response->headers->has('Strict-Transport-Security'));
        $this->assertEquals(
            'max-age=31536000; includeSubDomains',
            $response->headers->get('Strict-Transport-Security')
        );

        $this->assertTrue($response->headers->has('Cache-Control'));
        $this->assertEquals(
            'no-store, no-cache, must-revalidate, proxy-revalidate',
            $response->headers->get('Cache-Control')
        );
    }

    /**
     * Test logout functionality
     */
    public function test_logout()
    {
        $user = User::factory()->create();
        $token = auth()->login($user);

        $response = $this->postJson("{$this->baseUrl}/logout", [], [
            'Authorization' => "Bearer {$token}"
        ]);

        $response->assertStatus(200)
            ->assertJson([
                'status' => 'success',
                'message' => 'Successfully logged out'
            ]);

        // Verify token is invalidated
        $protectedResponse = $this->getJson('/api/v1/user', [
            'Authorization' => "Bearer {$token}"
        ]);
        $protectedResponse->assertStatus(401);

        // Verify audit log
        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $user->id,
            'action' => 'logout',
            'status' => 'success'
        ]);
    }
}