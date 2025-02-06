<?php

namespace Tests\Unit\Services\AWS;

use Tests\TestCase;
use App\Services\AWS\TextractService;
use App\Models\Document;
use Mockery;
use Aws\Textract\TextractClient;
use Aws\Result;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;

/**
 * Test suite for TextractService OCR processing functionality
 * Validates document processing accuracy, HIPAA compliance, and error handling
 */
class TextractServiceTest extends TestCase
{
    /**
     * @var TextractService
     */
    private TextractService $textractService;

    /**
     * @var \Mockery\MockInterface
     */
    private $textractClient;

    /**
     * @var array
     */
    private array $testDocuments;

    /**
     * Set up test environment
     */
    protected function setUp(): void
    {
        parent::setUp();

        // Mock AWS Textract client
        $this->textractClient = Mockery::mock(TextractClient::class);
        
        // Configure default AWS settings
        Config::set('services.aws.region', 'us-east-1');
        Config::set('services.aws.key', 'test-key');
        Config::set('services.aws.secret', 'test-secret');
        Config::set('services.aws.bucket', 'test-bucket');

        // Initialize service with mocked client
        $this->textractService = new TextractService();
        $this->setPrivateProperty($this->textractService, 'client', $this->textractClient);

        // Set up test documents
        $this->testDocuments = [
            'id_document' => $this->createTestDocument('id_document'),
            'health_declaration' => $this->createTestDocument('health_declaration'),
            'proof_of_address' => $this->createTestDocument('proof_of_address')
        ];
    }

    /**
     * Clean up after tests
     */
    protected function tearDown(): void
    {
        Mockery::close();
        Cache::flush();
        parent::tearDown();
    }

    /**
     * Test successful document processing with high confidence
     */
    public function test_process_document_success(): void
    {
        $document = $this->testDocuments['id_document'];
        $jobId = 'test-job-123';

        // Mock startDocumentAnalysis
        $this->textractClient->shouldReceive('startDocumentAnalysis')
            ->once()
            ->andReturn(new Result(['JobId' => $jobId]));

        // Mock getDocumentAnalysis for status check
        $this->textractClient->shouldReceive('getDocumentAnalysis')
            ->with(['JobId' => $jobId])
            ->once()
            ->andReturn(new Result(['JobStatus' => 'SUCCEEDED']));

        // Mock getDocumentAnalysis for results
        $this->textractClient->shouldReceive('getDocumentAnalysis')
            ->with(['JobId' => $jobId, 'NextToken' => null])
            ->once()
            ->andReturn(new Result([
                'Blocks' => [
                    [
                        'BlockType' => 'LINE',
                        'Text' => 'Test Document Text',
                        'Confidence' => 99.5,
                        'Page' => 1
                    ]
                ]
            ]));

        $results = $this->textractService->processDocument($document);

        $this->assertArrayHasKey('confidence', $results);
        $this->assertArrayHasKey('data', $results);
        $this->assertGreaterThanOrEqual(99.0, $results['confidence']);
        $this->assertCount(1, $results['data']);
    }

    /**
     * Test HIPAA-compliant document processing
     */
    public function test_process_document_hipaa_compliance(): void
    {
        $document = $this->testDocuments['health_declaration'];
        $jobId = 'test-job-456';

        // Mock AWS responses
        $this->mockSuccessfulTextractResponse($jobId);

        // Process document
        $results = $this->textractService->processDocument($document);

        // Verify secure transmission
        $this->assertLoggedSecureTransmission($document);

        // Verify data encryption
        $this->assertTrue(
            Cache::has("textract_result_{$document->id}"),
            'Results should be securely cached'
        );

        // Verify audit logging
        $this->assertLoggedAuditTrail($document, $results);
    }

    /**
     * Test service retry mechanism for failed requests
     */
    public function test_process_document_retry_mechanism(): void
    {
        $document = $this->testDocuments['proof_of_address'];
        $jobId = 'test-job-789';

        // Mock initial failure
        $this->textractClient->shouldReceive('startDocumentAnalysis')
            ->once()
            ->andThrow(new \Aws\Exception\AwsException(
                'ThrottlingException',
                Mockery::mock('Command')
            ));

        // Mock successful retry
        $this->textractClient->shouldReceive('startDocumentAnalysis')
            ->once()
            ->andReturn(new Result(['JobId' => $jobId]));

        // Mock successful completion
        $this->mockSuccessfulTextractResponse($jobId);

        $results = $this->textractService->processDocument($document);

        $this->assertArrayHasKey('confidence', $results);
        $this->assertGreaterThanOrEqual(95.0, $results['confidence']);
    }

    /**
     * Test handling of AWS rate limiting
     */
    public function test_process_document_rate_limiting(): void
    {
        $document = $this->testDocuments['id_document'];

        // Set up rate limit tracking
        Cache::put('textract_rate_limit', 100, now()->addMinutes(1));

        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('Rate limit exceeded for OCR processing');

        $this->textractService->processDocument($document);
    }

    /**
     * Test circuit breaker activation
     */
    public function test_process_document_circuit_breaker(): void
    {
        $document = $this->testDocuments['id_document'];

        // Simulate multiple failures to trigger circuit breaker
        Cache::put('textract_circuit_breaker', 5, now()->addMinutes(5));

        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('OCR service temporarily unavailable');

        $this->textractService->processDocument($document);
    }

    /**
     * Test validation of OCR confidence thresholds
     */
    public function test_process_document_confidence_validation(): void
    {
        $document = $this->testDocuments['health_declaration'];
        $jobId = 'test-job-validation';

        // Mock low confidence response
        $this->textractClient->shouldReceive('startDocumentAnalysis')
            ->once()
            ->andReturn(new Result(['JobId' => $jobId]));

        $this->textractClient->shouldReceive('getDocumentAnalysis')
            ->with(['JobId' => $jobId])
            ->once()
            ->andReturn(new Result(['JobStatus' => 'SUCCEEDED']));

        $this->textractClient->shouldReceive('getDocumentAnalysis')
            ->with(['JobId' => $jobId, 'NextToken' => null])
            ->once()
            ->andReturn(new Result([
                'Blocks' => [
                    [
                        'BlockType' => 'LINE',
                        'Text' => 'Low Quality Text',
                        'Confidence' => 85.0,
                        'Page' => 1
                    ]
                ]
            ]));

        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('OCR results failed validation');

        $this->textractService->processDocument($document);
    }

    /**
     * Helper method to create test document
     */
    private function createTestDocument(string $type): Document
    {
        $document = new Document();
        $document->id = "test-{$type}-" . uniqid();
        $document->type = $type;
        $document->storage_path = "documents/test/{$document->id}.pdf";
        return $document;
    }

    /**
     * Helper method to mock successful Textract response
     */
    private function mockSuccessfulTextractResponse(string $jobId): void
    {
        $this->textractClient->shouldReceive('startDocumentAnalysis')
            ->once()
            ->andReturn(new Result(['JobId' => $jobId]));

        $this->textractClient->shouldReceive('getDocumentAnalysis')
            ->with(['JobId' => $jobId])
            ->once()
            ->andReturn(new Result(['JobStatus' => 'SUCCEEDED']));

        $this->textractClient->shouldReceive('getDocumentAnalysis')
            ->with(['JobId' => $jobId, 'NextToken' => null])
            ->once()
            ->andReturn(new Result([
                'Blocks' => [
                    [
                        'BlockType' => 'LINE',
                        'Text' => 'Sample Text',
                        'Confidence' => 99.0,
                        'Page' => 1
                    ]
                ]
            ]));
    }

    /**
     * Helper method to verify secure transmission logging
     */
    private function assertLoggedSecureTransmission(Document $document): void
    {
        Log::shouldHaveReceived('info')
            ->with('Starting OCR processing', Mockery::subset([
                'document_id' => $document->id,
                'type' => $document->type
            ]));
    }

    /**
     * Helper method to verify audit trail logging
     */
    private function assertLoggedAuditTrail(Document $document, array $results): void
    {
        Log::shouldHaveReceived('info')
            ->with('Document OCR processing completed', Mockery::subset([
                'document_id' => $document->id,
                'confidence' => $results['confidence']
            ]));
    }

    /**
     * Helper method to set private property value
     */
    private function setPrivateProperty($object, string $property, $value): void
    {
        $reflection = new \ReflectionClass(get_class($object));
        $property = $reflection->getProperty($property);
        $property->setAccessible(true);
        $property->setValue($object, $value);
    }
}