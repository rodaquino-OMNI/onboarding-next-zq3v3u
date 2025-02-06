<?php

namespace Tests\Feature\API\V1;

use Tests\TestCase;
use App\Models\Interview;
use App\Models\User;
use App\Models\Enrollment;
use App\Services\Video\VonageService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Mockery;
use Carbon\Carbon;
use Illuminate\Support\Str;

/**
 * Feature tests for medical interview management API endpoints
 * with enhanced security and compliance validation.
 *
 * @package Tests\Feature\API\V1
 * @version 1.0.0
 */
class InterviewTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @var VonageService
     */
    protected $vonageService;

    /**
     * @var User
     */
    protected $interviewer;

    /**
     * @var User
     */
    protected $enrollee;

    /**
     * @var Enrollment
     */
    protected $enrollment;

    /**
     * @var Interview
     */
    protected $interview;

    /**
     * Set up test environment
     *
     * @return void
     */
    protected function setUp(): void
    {
        parent::setUp();

        // Create test users
        $this->interviewer = User::factory()->create([
            'role' => 'interviewer',
            'email_verified_at' => now(),
        ]);

        $this->enrollee = User::factory()->create([
            'role' => 'individual',
            'email_verified_at' => now(),
        ]);

        // Create test enrollment
        $this->enrollment = Enrollment::factory()->create([
            'user_id' => $this->enrollee->id,
            'status' => 'health_declaration_pending'
        ]);

        // Mock Vonage service
        $this->vonageService = Mockery::mock(VonageService::class);
        $this->app->instance(VonageService::class, $this->vonageService);

        // Configure test environment
        Config::set('services.vonage.key', 'test-key');
        Config::set('services.vonage.secret', 'test-secret');
    }

    /**
     * Test interview scheduling with HIPAA compliance
     *
     * @return void
     */
    public function test_schedule_interview_with_hipaa_compliance()
    {
        $scheduledTime = Carbon::now()->addDays(2);
        
        $this->vonageService->shouldReceive('createSession')
            ->once()
            ->andReturn([
                'sessionId' => Str::uuid(),
                'region' => 'sa-east-1',
                'mediaMode' => 'routed',
                'configuration' => [
                    'security' => [
                        'mediaEncryption' => true,
                        'enforceE2E' => true
                    ]
                ]
            ]);

        $response = $this->actingAs($this->interviewer)
            ->postJson('/api/v1/interviews', [
                'enrollment_id' => $this->enrollment->id,
                'scheduled_at' => $scheduledTime->toISOString(),
                'interviewer_id' => $this->interviewer->id
            ]);

        $response->assertStatus(201)
            ->assertJsonStructure([
                'data' => [
                    'id',
                    'enrollment_id',
                    'interviewer_id',
                    'status',
                    'scheduled_at',
                    'video_provider',
                    'created_at'
                ]
            ]);

        $this->assertDatabaseHas('interviews', [
            'enrollment_id' => $this->enrollment->id,
            'interviewer_id' => $this->interviewer->id,
            'status' => 'scheduled'
        ]);
    }

    /**
     * Test video session creation with regional optimization
     *
     * @return void
     */
    public function test_create_video_session_with_regional_routing()
    {
        $interview = Interview::factory()->create([
            'enrollment_id' => $this->enrollment->id,
            'interviewer_id' => $this->interviewer->id,
            'status' => 'scheduled'
        ]);

        $sessionConfig = [
            'sessionId' => Str::uuid(),
            'region' => 'sa-east-1',
            'mediaMode' => 'routed'
        ];

        $this->vonageService->shouldReceive('createSession')
            ->once()
            ->andReturn($sessionConfig);

        $response = $this->actingAs($this->interviewer)
            ->postJson("/api/v1/interviews/{$interview->id}/session");

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'session_id',
                    'region',
                    'token',
                    'expires_at'
                ]
            ]);

        $this->assertDatabaseHas('interviews', [
            'id' => $interview->id,
            'video_session_id' => $sessionConfig['sessionId']
        ]);
    }

    /**
     * Test interview status updates with audit trail
     *
     * @return void
     */
    public function test_update_interview_status_with_audit_trail()
    {
        $interview = Interview::factory()->create([
            'enrollment_id' => $this->enrollment->id,
            'interviewer_id' => $this->interviewer->id,
            'status' => 'scheduled'
        ]);

        $response = $this->actingAs($this->interviewer)
            ->patchJson("/api/v1/interviews/{$interview->id}/status", [
                'status' => 'completed',
                'notes' => ['general_health' => 'Good', 'recommendations' => 'None']
            ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'id',
                    'status',
                    'updated_at'
                ]
            ]);

        $this->assertDatabaseHas('interviews', [
            'id' => $interview->id,
            'status' => 'completed'
        ]);

        // Verify audit trail
        $updatedInterview = Interview::find($interview->id);
        $this->assertNotEmpty($updatedInterview->audit_trail);
        $this->assertArrayHasKey('status_updated', array_column($updatedInterview->audit_trail, 'action'));
    }

    /**
     * Test interview rescheduling with availability validation
     *
     * @return void
     */
    public function test_reschedule_interview_with_availability_check()
    {
        $interview = Interview::factory()->create([
            'enrollment_id' => $this->enrollment->id,
            'interviewer_id' => $this->interviewer->id,
            'status' => 'scheduled'
        ]);

        $newDateTime = Carbon::now()->addDays(3);

        $response = $this->actingAs($this->interviewer)
            ->putJson("/api/v1/interviews/{$interview->id}/schedule", [
                'scheduled_at' => $newDateTime->toISOString()
            ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'id',
                    'scheduled_at',
                    'status'
                ]
            ]);

        $this->assertDatabaseHas('interviews', [
            'id' => $interview->id,
            'status' => 'rescheduled'
        ]);
    }

    /**
     * Test interview session security measures
     *
     * @return void
     */
    public function test_interview_session_security_measures()
    {
        $interview = Interview::factory()->create([
            'enrollment_id' => $this->enrollment->id,
            'interviewer_id' => $this->interviewer->id,
            'status' => 'scheduled'
        ]);

        $this->vonageService->shouldReceive('createSession')
            ->once()
            ->andReturn([
                'sessionId' => Str::uuid(),
                'security' => [
                    'mediaEncryption' => true,
                    'enforceE2E' => true
                ]
            ]);

        $this->vonageService->shouldReceive('generateToken')
            ->once()
            ->andReturn([
                'token' => Str::random(64),
                'role' => 'interviewer',
                'expires_at' => time() + 3600
            ]);

        $response = $this->actingAs($this->interviewer)
            ->getJson("/api/v1/interviews/{$interview->id}/token");

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'token',
                    'expires_at',
                    'permissions'
                ]
            ]);
    }

    /**
     * Test interview data encryption compliance
     *
     * @return void
     */
    public function test_interview_data_encryption_compliance()
    {
        $interview = Interview::factory()->create([
            'enrollment_id' => $this->enrollment->id,
            'interviewer_id' => $this->interviewer->id,
            'status' => 'completed'
        ]);

        $medicalNotes = [
            'diagnosis' => 'Healthy',
            'recommendations' => 'Regular check-ups'
        ];

        $response = $this->actingAs($this->interviewer)
            ->postJson("/api/v1/interviews/{$interview->id}/notes", [
                'notes' => $medicalNotes
            ]);

        $response->assertStatus(200);

        $updatedInterview = Interview::find($interview->id);
        $this->assertNotEmpty($updatedInterview->encrypted_notes);
        $this->assertIsString($updatedInterview->encrypted_notes);
    }

    /**
     * Clean up after tests
     *
     * @return void
     */
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }
}