<?php

namespace Tests\Feature\API\V1;

use Tests\TestCase;
use App\Models\HealthRecord;
use App\Models\User;
use App\Models\Enrollment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\WithFaker;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;

/**
 * Feature tests for HIPAA-compliant health record API endpoints
 */
class HealthRecordTest extends TestCase
{
    use RefreshDatabase, WithFaker;

    /**
     * Base API URL for health records
     */
    protected string $baseUrl = '/api/v1/health-records';

    /**
     * Required HIPAA compliance headers
     */
    protected array $requiredHIPAAHeaders = [
        'X-HIPAA-Compliance' => 'true',
        'X-PHI-Access-Reason' => 'healthcare_operations'
    ];

    /**
     * Fields requiring encryption
     */
    protected array $sensitiveFields = [
        'medical_history',
        'chronic_conditions',
        'family_history'
    ];

    /**
     * Test user instance
     */
    protected User $user;

    /**
     * Test enrollment instance
     */
    protected Enrollment $enrollment;

    /**
     * Test health record instance
     */
    protected HealthRecord $healthRecord;

    /**
     * Set up test environment
     */
    protected function setUp(): void
    {
        parent::setUp();

        // Create test user with appropriate permissions
        $this->user = User::factory()->create([
            'role' => 'individual'
        ]);

        // Create test enrollment
        $this->enrollment = Enrollment::factory()->create([
            'user_id' => $this->user->id,
            'status' => 'health_declaration_pending'
        ]);

        // Create test health record
        $this->healthRecord = HealthRecord::factory()->create([
            'enrollment_id' => $this->enrollment->id,
            'verified' => false
        ]);

        // Set up authentication
        $this->actingAs($this->user);
    }

    /**
     * Test health record creation with HIPAA compliance
     */
    public function test_can_create_health_record_with_hipaa_compliance()
    {
        $healthData = [
            'medical_history' => [
                ['condition' => 'Hypertension', 'diagnosed_date' => '2020-01-01'],
                ['condition' => 'Diabetes Type 2', 'diagnosed_date' => '2019-06-15']
            ],
            'current_medications' => [
                ['name' => 'Lisinopril', 'dosage' => '10mg', 'frequency' => 'daily'],
                ['name' => 'Metformin', 'dosage' => '500mg', 'frequency' => 'twice daily']
            ],
            'allergies' => [
                ['allergen' => 'Penicillin', 'severity' => 'severe'],
                ['allergen' => 'Peanuts', 'severity' => 'moderate']
            ]
        ];

        $response = $this->postJson($this->baseUrl, [
            'enrollment_id' => $this->enrollment->id,
            'health_data' => $healthData
        ], $this->requiredHIPAAHeaders);

        $response->assertStatus(201)
            ->assertJsonStructure([
                'data' => [
                    'id',
                    'enrollment_id',
                    'verified',
                    'submitted_at'
                ]
            ]);

        // Verify data encryption
        $record = HealthRecord::find($response->json('data.id'));
        foreach ($this->sensitiveFields as $field) {
            if (isset($record->health_data[$field])) {
                $this->assertNotEquals(
                    $healthData[$field],
                    $record->health_data[$field],
                    "Field {$field} should be encrypted"
                );
            }
        }

        // Verify audit log entry
        $this->assertDatabaseHas('audit_logs', [
            'event' => 'health_record.created',
            'auditable_type' => HealthRecord::class,
            'auditable_id' => $record->id,
            'user_id' => $this->user->id
        ]);
    }

    /**
     * Test health record retrieval with proper authorization
     */
    public function test_can_retrieve_health_record_with_authorization()
    {
        $response = $this->getJson(
            "{$this->baseUrl}/{$this->healthRecord->id}",
            $this->requiredHIPAAHeaders
        );

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'id',
                    'enrollment_id',
                    'health_data',
                    'verified',
                    'submitted_at'
                ]
            ]);

        // Verify PHI access logging
        $this->assertDatabaseHas('audit_logs', [
            'event' => 'health_record.accessed',
            'auditable_type' => HealthRecord::class,
            'auditable_id' => $this->healthRecord->id,
            'user_id' => $this->user->id
        ]);
    }

    /**
     * Test health record update with encryption validation
     */
    public function test_can_update_health_record_with_encryption()
    {
        $updatedData = [
            'medical_history' => [
                ['condition' => 'Asthma', 'diagnosed_date' => '2021-03-15']
            ],
            'current_medications' => [
                ['name' => 'Albuterol', 'dosage' => '90mcg', 'frequency' => 'as needed']
            ],
            'allergies' => [
                ['allergen' => 'Dust', 'severity' => 'moderate']
            ]
        ];

        $response = $this->putJson(
            "{$this->baseUrl}/{$this->healthRecord->id}",
            ['health_data' => $updatedData],
            $this->requiredHIPAAHeaders
        );

        $response->assertStatus(200);

        // Verify field-level encryption
        $record = HealthRecord::find($this->healthRecord->id);
        foreach ($this->sensitiveFields as $field) {
            if (isset($record->health_data[$field])) {
                $decrypted = json_decode(
                    Crypt::decryptString($record->health_data[$field]),
                    true
                );
                $this->assertEquals(
                    $updatedData[$field],
                    $decrypted,
                    "Field {$field} should be properly encrypted and decryptable"
                );
            }
        }
    }

    /**
     * Test health record verification with audit trail
     */
    public function test_can_verify_health_record_with_audit()
    {
        $response = $this->postJson(
            "{$this->baseUrl}/{$this->healthRecord->id}/verify",
            [],
            $this->requiredHIPAAHeaders
        );

        $response->assertStatus(200)
            ->assertJson([
                'data' => [
                    'verified' => true
                ]
            ]);

        // Verify audit trail
        $this->assertDatabaseHas('audit_logs', [
            'event' => 'health_record.verified',
            'auditable_type' => HealthRecord::class,
            'auditable_id' => $this->healthRecord->id,
            'user_id' => $this->user->id
        ]);
    }

    /**
     * Test HIPAA compliance header validation
     */
    public function test_enforces_hipaa_compliance_headers()
    {
        $response = $this->getJson("{$this->baseUrl}/{$this->healthRecord->id}");

        $response->assertStatus(403)
            ->assertJson([
                'error' => 'Missing required HIPAA compliance headers'
            ]);
    }

    /**
     * Test unauthorized access prevention
     */
    public function test_prevents_unauthorized_access()
    {
        $unauthorizedUser = User::factory()->create(['role' => 'individual']);
        $this->actingAs($unauthorizedUser);

        $response = $this->getJson(
            "{$this->baseUrl}/{$this->healthRecord->id}",
            $this->requiredHIPAAHeaders
        );

        $response->assertStatus(403);
    }

    /**
     * Test sensitive data redaction in responses
     */
    public function test_redacts_sensitive_data_in_responses()
    {
        $response = $this->getJson(
            "{$this->baseUrl}/{$this->healthRecord->id}",
            $this->requiredHIPAAHeaders
        );

        $response->assertStatus(200);
        $data = $response->json('data');

        foreach ($this->sensitiveFields as $field) {
            $this->assertArrayNotHasKey(
                $field,
                $data['health_data'],
                "Sensitive field {$field} should be redacted from response"
            );
        }
    }
}