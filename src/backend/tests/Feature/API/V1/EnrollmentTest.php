<?php

namespace Tests\Feature\API\V1;

use Tests\TestCase;
use App\Models\Enrollment;
use App\Models\User;
use App\Models\Document;
use App\Models\HealthRecord;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\WithFaker;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Feature tests for enrollment API endpoints with HIPAA compliance validation
 */
class EnrollmentTest extends TestCase
{
    use RefreshDatabase, WithFaker;

    /**
     * Base API URL for enrollment endpoints
     */
    private const API_BASE = '/api/v1/enrollments';

    /**
     * Test user instance
     */
    private User $user;

    /**
     * Test enrollment instance
     */
    private Enrollment $enrollment;

    /**
     * Required document types for enrollment
     */
    private array $requiredDocuments = [
        'id_document',
        'proof_of_address',
        'health_declaration'
    ];

    /**
     * Set up test environment
     */
    protected function setUp(): void
    {
        parent::setUp();

        // Create test user with required role
        $this->user = User::factory()->create([
            'role' => 'individual',
            'email_verified_at' => now(),
            'language' => 'en'
        ]);

        // Create test enrollment
        $this->enrollment = Enrollment::factory()->create([
            'user_id' => $this->user->id,
            'status' => 'draft'
        ]);

        // Enable audit logging for tests
        Log::spy();
    }

    /**
     * Test enrollment creation with HIPAA compliance validation
     */
    public function test_create_enrollment_with_hipaa_compliance(): void
    {
        $payload = [
            'language' => 'en',
            'metadata' => [
                'age' => 35,
                'gender' => 'F',
                'health_declaration' => [
                    'has_chronic_conditions' => false,
                    'current_medications' => []
                ]
            ],
            'encrypted_data' => [
                'ssn' => Hash::make('123-45-6789'),
                'medical_history' => $this->faker->text()
            ]
        ];

        $response = $this->actingAs($this->user)
            ->postJson(self::API_BASE, $payload);

        $response->assertStatus(201)
            ->assertJsonStructure([
                'status',
                'data' => [
                    'id',
                    'status',
                    'metadata',
                    'created_at'
                ]
            ]);

        // Verify HIPAA compliance
        $this->assertDatabaseHas('enrollments', [
            'id' => $response->json('data.id'),
            'user_id' => $this->user->id,
            'status' => 'draft'
        ]);

        // Verify audit logging
        Log::shouldHaveReceived('info')
            ->with('Enrollment created', \Mockery::subset([
                'enrollment_id' => $response->json('data.id'),
                'user_id' => $this->user->id
            ]));
    }

    /**
     * Test enrollment document upload with OCR validation
     */
    public function test_upload_enrollment_documents(): void
    {
        $document = [
            'type' => 'id_document',
            'file' => $this->faker->image(),
            'metadata' => [
                'document_type' => 'passport',
                'issuing_country' => 'BR'
            ]
        ];

        $response = $this->actingAs($this->user)
            ->postJson(self::API_BASE . "/{$this->enrollment->id}/documents", $document);

        $response->assertStatus(201)
            ->assertJsonStructure([
                'status',
                'data' => [
                    'id',
                    'type',
                    'status',
                    'ocr_data'
                ]
            ]);

        // Verify document processing
        $this->assertDatabaseHas('documents', [
            'enrollment_id' => $this->enrollment->id,
            'type' => $document['type'],
            'status' => 'processing'
        ]);
    }

    /**
     * Test enrollment status updates with validation
     */
    public function test_update_enrollment_status(): void
    {
        // Add required documents
        foreach ($this->requiredDocuments as $type) {
            Document::factory()->create([
                'enrollment_id' => $this->enrollment->id,
                'type' => $type,
                'status' => 'processed'
            ]);
        }

        $response = $this->actingAs($this->user)
            ->patchJson(self::API_BASE . "/{$this->enrollment->id}", [
                'status' => 'documents_submitted'
            ]);

        $response->assertStatus(200)
            ->assertJson([
                'status' => 'success',
                'data' => [
                    'status' => 'documents_submitted'
                ]
            ]);

        // Verify status update
        $this->assertDatabaseHas('enrollments', [
            'id' => $this->enrollment->id,
            'status' => 'documents_submitted'
        ]);
    }

    /**
     * Test multi-language support for enrollment processing
     */
    public function test_enrollment_multi_language_support(): void
    {
        $languages = ['en', 'pt-BR', 'es'];

        foreach ($languages as $language) {
            $this->user->update(['language' => $language]);

            $response = $this->actingAs($this->user)
                ->getJson(self::API_BASE . "/{$this->enrollment->id}");

            $response->assertStatus(200)
                ->assertHeader('Content-Language', $language);
        }
    }

    /**
     * Test enrollment security controls and data protection
     */
    public function test_enrollment_security_controls(): void
    {
        // Test unauthorized access
        $response = $this->getJson(self::API_BASE . "/{$this->enrollment->id}");
        $response->assertStatus(401);

        // Test CSRF protection
        $response = $this->post(self::API_BASE);
        $response->assertStatus(419);

        // Test rate limiting
        for ($i = 0; $i < 101; $i++) {
            $response = $this->actingAs($this->user)
                ->getJson(self::API_BASE . "/{$this->enrollment->id}");
        }
        $response->assertStatus(429);

        // Test role-based access
        $adminUser = User::factory()->create(['role' => 'admin']);
        $response = $this->actingAs($adminUser)
            ->getJson(self::API_BASE . "/{$this->enrollment->id}");
        $response->assertStatus(200);
    }

    /**
     * Test health record submission with HIPAA validation
     */
    public function test_submit_health_record(): void
    {
        $healthData = [
            'medical_history' => [
                'conditions' => [],
                'surgeries' => [],
                'medications' => []
            ],
            'allergies' => [],
            'family_history' => [],
            'lifestyle_factors' => [
                'smoking' => false,
                'alcohol' => false
            ]
        ];

        $response = $this->actingAs($this->user)
            ->postJson(self::API_BASE . "/{$this->enrollment->id}/health-record", $healthData);

        $response->assertStatus(201)
            ->assertJsonStructure([
                'status',
                'data' => [
                    'id',
                    'verified',
                    'submitted_at'
                ]
            ]);

        // Verify health record creation
        $this->assertDatabaseHas('health_records', [
            'enrollment_id' => $this->enrollment->id,
            'verified' => false
        ]);
    }

    /**
     * Test enrollment completion with all requirements
     */
    public function test_complete_enrollment(): void
    {
        // Add required documents
        foreach ($this->requiredDocuments as $type) {
            Document::factory()->create([
                'enrollment_id' => $this->enrollment->id,
                'type' => $type,
                'status' => 'processed'
            ]);
        }

        // Add health record
        HealthRecord::factory()->create([
            'enrollment_id' => $this->enrollment->id,
            'verified' => true
        ]);

        $response = $this->actingAs($this->user)
            ->patchJson(self::API_BASE . "/{$this->enrollment->id}", [
                'status' => 'completed'
            ]);

        $response->assertStatus(200)
            ->assertJson([
                'status' => 'success',
                'data' => [
                    'status' => 'completed',
                    'completed_at' => now()->toISOString()
                ]
            ]);
    }
}