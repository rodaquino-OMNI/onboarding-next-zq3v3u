<?php

namespace Tests\Feature\API\V1;

use Tests\TestCase;
use App\Models\Document;
use App\Services\AWS\TextractService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Mockery;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;

/**
 * Feature tests for document management API endpoints with HIPAA compliance validation
 *
 * @group api
 * @group documents
 * @group security
 */
class DocumentTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Base API endpoint for documents
     */
    private string $baseUrl = '/api/v1/documents';

    /**
     * Mock TextractService instance
     */
    private $textractService;

    /**
     * Required OCR confidence threshold
     */
    private const REQUIRED_CONFIDENCE = 0.99;

    /**
     * Set up test environment with security configurations
     *
     * @return void
     */
    protected function setUp(): void
    {
        parent::setUp();

        // Create secure storage fake
        Storage::fake('s3');

        // Mock TextractService
        $this->textractService = Mockery::mock(TextractService::class);
        $this->app->instance(TextractService::class, $this->textractService);

        // Set up test user with proper permissions
        $this->actingAs($this->createTestUser());

        // Configure audit logging
        config(['logging.channels.audit.driver' => 'daily']);
    }

    /**
     * Test secure document upload with encryption validation
     *
     * @return void
     */
    public function test_can_upload_document(): void
    {
        // Create encrypted test file
        $file = UploadedFile::fake()->create('test-document.pdf', 500);

        // Configure TextractService mock
        $this->textractService->shouldReceive('processDocument')
            ->once()
            ->andReturn([
                'confidence' => self::REQUIRED_CONFIDENCE,
                'data' => ['text' => 'Test document content']
            ]);

        // Send POST request with security headers
        $response = $this->postJson($this->baseUrl, [
            'file' => $file,
            'type' => 'health_declaration',
            'enrollment_id' => Str::uuid()
        ], [
            'X-Request-ID' => Str::uuid(),
            'X-Security-Token' => config('app.security_token')
        ]);

        // Assert successful upload
        $response->assertStatus(201)
            ->assertJsonStructure([
                'status',
                'data' => [
                    'id',
                    'type',
                    'status',
                    'created_at'
                ]
            ]);

        // Verify file storage and encryption
        Storage::disk('s3')->assertExists($response->json('data.storage_path'));
        $this->assertTrue($this->verifyFileEncryption($response->json('data.id')));

        // Verify audit log entry
        $this->assertDatabaseHas('audit_logs', [
            'event' => 'document_uploaded',
            'document_id' => $response->json('data.id')
        ]);
    }

    /**
     * Test document processing accuracy meets 99% requirement
     *
     * @return void
     */
    public function test_document_processing_accuracy(): void
    {
        // Create test document
        $document = Document::factory()->create([
            'type' => 'health_declaration',
            'status' => 'pending'
        ]);

        // Configure TextractService mock with accuracy validation
        $this->textractService->shouldReceive('processDocument')
            ->once()
            ->andReturn([
                'confidence' => self::REQUIRED_CONFIDENCE,
                'data' => [
                    'text' => 'Test document content',
                    'fields' => [
                        ['name' => 'field1', 'value' => 'value1', 'confidence' => 0.99],
                        ['name' => 'field2', 'value' => 'value2', 'confidence' => 0.995]
                    ]
                ]
            ]);

        // Trigger document processing
        $response = $this->postJson("{$this->baseUrl}/{$document->id}/process");

        // Assert successful processing
        $response->assertStatus(200)
            ->assertJson([
                'status' => 'success',
                'data' => [
                    'id' => $document->id,
                    'status' => 'processed',
                    'confidence' => self::REQUIRED_CONFIDENCE
                ]
            ]);

        // Verify OCR results meet accuracy requirement
        $document->refresh();
        $this->assertTrue($document->isProcessed());
        $this->assertGreaterThanOrEqual(self::REQUIRED_CONFIDENCE, $document->ocr_data['confidence']);
    }

    /**
     * Test document encryption validation
     *
     * @return void
     */
    public function test_document_encryption_validation(): void
    {
        // Create test document with known content
        $content = 'Sensitive medical information';
        $file = UploadedFile::fake()->create('medical-record.pdf', 500, function($file) use ($content) {
            file_put_contents($file->getPathname(), $content);
        });

        // Upload document
        $response = $this->postJson($this->baseUrl, [
            'file' => $file,
            'type' => 'health_declaration',
            'enrollment_id' => Str::uuid()
        ]);

        $documentId = $response->json('data.id');
        $storagePath = $response->json('data.storage_path');

        // Verify file is encrypted in storage
        $storedContent = Storage::disk('s3')->get($storagePath);
        $this->assertNotEquals($content, $storedContent);
        $this->assertTrue($this->verifyFileEncryption($documentId));
    }

    /**
     * Test HIPAA compliance headers for document endpoints
     *
     * @return void
     */
    public function test_hipaa_compliance_headers(): void
    {
        $response = $this->getJson($this->baseUrl);

        $response->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
            ->assertHeader('Content-Security-Policy', "default-src 'self'")
            ->assertHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    }

    /**
     * Test document access audit logging
     *
     * @return void
     */
    public function test_document_access_audit_logging(): void
    {
        $document = Document::factory()->create();

        // Access document
        $response = $this->getJson("{$this->baseUrl}/{$document->id}");

        // Verify audit log entry
        $this->assertDatabaseHas('audit_logs', [
            'event' => 'document_accessed',
            'document_id' => $document->id,
            'user_id' => auth()->id(),
            'ip_address' => request()->ip()
        ]);
    }

    /**
     * Helper method to verify file encryption
     *
     * @param string $documentId
     * @return bool
     */
    private function verifyFileEncryption(string $documentId): bool
    {
        $document = Document::findOrFail($documentId);
        $storagePath = $document->storage_path;
        
        // Check for encryption headers
        $metadata = Storage::disk('s3')->getMetadata($storagePath);
        return isset($metadata['encryption']) && 
               $metadata['encryption']['algorithm'] === 'AES256';
    }

    /**
     * Helper method to create test user
     *
     * @return \App\Models\User
     */
    private function createTestUser(): \App\Models\User
    {
        return \App\Models\User::factory()->create([
            'role' => 'admin'
        ]);
    }
}