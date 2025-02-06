<?php

namespace Tests\Feature\API\V1;

use Tests\TestCase;
use App\Models\User;
use Database\Factories\UserFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\WithFaker;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class UserTest extends TestCase
{
    use RefreshDatabase, WithFaker;

    /**
     * Base API URL for user endpoints
     */
    protected string $baseUrl = '/api/v1/users';

    /**
     * Supported languages for testing
     */
    protected array $supportedLanguages = ['en', 'pt-BR', 'es'];

    /**
     * User roles for testing
     */
    protected array $userRoles = ['admin', 'broker', 'interviewer', 'individual'];

    /**
     * Set up test environment
     *
     * @return void
     */
    protected function setUp(): void
    {
        parent::setUp();

        // Create test users with different roles
        foreach ($this->userRoles as $role) {
            User::factory()->role($role)->create();
        }
    }

    /**
     * Test user authentication with security validations
     *
     * @return void
     */
    public function test_user_authentication()
    {
        $password = 'SecurePass123!';
        $user = User::factory()->create([
            'password' => Hash::make($password),
            'email_verified_at' => now()
        ]);

        // Test successful authentication
        $response = $this->postJson($this->baseUrl . '/login', [
            'email' => $user->email,
            'password' => $password
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'status',
                'data' => [
                    'token',
                    'user' => [
                        'id',
                        'name',
                        'email',
                        'role',
                        'language',
                        'preferences'
                    ]
                ]
            ])
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY');

        // Test failed authentication
        $response = $this->postJson($this->baseUrl . '/login', [
            'email' => $user->email,
            'password' => 'WrongPassword'
        ]);

        $response->assertStatus(401);

        // Test rate limiting
        for ($i = 0; $i < 6; $i++) {
            $this->postJson($this->baseUrl . '/login', [
                'email' => $user->email,
                'password' => 'WrongPassword'
            ]);
        }

        $response = $this->postJson($this->baseUrl . '/login', [
            'email' => $user->email,
            'password' => $password
        ]);

        $response->assertStatus(429);
    }

    /**
     * Test user registration with HIPAA compliance
     *
     * @return void
     */
    public function test_user_registration()
    {
        $userData = [
            'name' => $this->faker->name,
            'email' => $this->faker->unique()->safeEmail,
            'password' => 'SecurePass123!',
            'password_confirmation' => 'SecurePass123!',
            'language' => 'en',
            'role' => 'individual',
            'consent' => [
                'terms_of_service' => true,
                'privacy_policy' => true,
                'data_processing' => true
            ]
        ];

        $response = $this->postJson($this->baseUrl . '/register', $userData);

        $response->assertStatus(201)
            ->assertJsonStructure([
                'status',
                'data' => [
                    'user' => [
                        'id',
                        'name',
                        'email',
                        'role',
                        'language'
                    ]
                ]
            ]);

        $this->assertDatabaseHas('users', [
            'email' => $userData['email'],
            'role' => $userData['role']
        ]);
    }

    /**
     * Test role-based access control
     *
     * @return void
     */
    public function test_role_based_access()
    {
        $admin = User::factory()->role('admin')->create();
        $individual = User::factory()->role('individual')->create();

        // Test admin access to user list
        $response = $this->actingAs($admin)
            ->getJson($this->baseUrl);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'status',
                'data' => [
                    'users' => [
                        '*' => [
                            'id',
                            'name',
                            'email',
                            'role'
                        ]
                    ]
                ]
            ]);

        // Test individual user restricted access
        $response = $this->actingAs($individual)
            ->getJson($this->baseUrl);

        $response->assertStatus(403);
    }

    /**
     * Test multi-language support
     *
     * @return void
     */
    public function test_language_preferences()
    {
        $user = User::factory()->create();

        foreach ($this->supportedLanguages as $language) {
            $response = $this->actingAs($user)
                ->putJson($this->baseUrl . '/preferences', [
                    'language' => $language
                ]);

            $response->assertStatus(200)
                ->assertJson([
                    'status' => 'success',
                    'data' => [
                        'preferences' => [
                            'language' => $language
                        ]
                    ]
                ]);
        }
    }

    /**
     * Test user profile update with security validations
     *
     * @return void
     */
    public function test_profile_update()
    {
        $user = User::factory()->create();
        $newData = [
            'name' => $this->faker->name,
            'current_password' => 'Password123!',
            'new_password' => 'NewSecurePass456!',
            'new_password_confirmation' => 'NewSecurePass456!'
        ];

        $response = $this->actingAs($user)
            ->putJson($this->baseUrl . '/profile', $newData);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'status',
                'data' => [
                    'user' => [
                        'id',
                        'name',
                        'email',
                        'updated_at'
                    ]
                ]
            ]);

        // Verify password history
        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'name' => $newData['name']
        ]);
    }

    /**
     * Test user account deletion with GDPR compliance
     *
     * @return void
     */
    public function test_account_deletion()
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)
            ->deleteJson($this->baseUrl . '/account', [
                'password' => 'Password123!',
                'deletion_reason' => 'GDPR request'
            ]);

        $response->assertStatus(200);

        // Verify soft deletion and audit trail
        $this->assertSoftDeleted('users', [
            'id' => $user->id
        ]);
    }

    /**
     * Test user data export for GDPR compliance
     *
     * @return void
     */
    public function test_data_export()
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)
            ->getJson($this->baseUrl . '/export');

        $response->assertStatus(200)
            ->assertHeader('Content-Type', 'application/json')
            ->assertJsonStructure([
                'user_data' => [
                    'profile',
                    'preferences',
                    'consent_log',
                    'activity_log'
                ]
            ]);
    }

    /**
     * Test user session management
     *
     * @return void
     */
    public function test_session_management()
    {
        $user = User::factory()->create();

        // Test active sessions listing
        $response = $this->actingAs($user)
            ->getJson($this->baseUrl . '/sessions');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'status',
                'data' => [
                    'sessions' => [
                        '*' => [
                            'id',
                            'ip_address',
                            'user_agent',
                            'last_active'
                        ]
                    ]
                ]
            ]);

        // Test session termination
        $response = $this->actingAs($user)
            ->deleteJson($this->baseUrl . '/sessions/all');

        $response->assertStatus(200);
    }
}