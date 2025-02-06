<?php

namespace Tests\Unit\Services\EMR;

use Tests\TestCase;
use App\Services\EMR\FHIRService;
use App\Models\HealthRecord;
use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response;
use GuzzleHttp\Exception\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;

/**
 * Unit Test Suite for FHIRService
 * 
 * Tests EMR integration functionality, FHIR compliance, security controls,
 * and health data exchange capabilities with extensive validation.
 */
class FHIRServiceTest extends TestCase
{
    /**
     * @var FHIRService
     */
    protected FHIRService $fhirService;

    /**
     * @var MockHandler
     */
    protected MockHandler $mockHandler;

    /**
     * @var Client
     */
    protected Client $httpClient;

    /**
     * @var string
     */
    protected string $baseUrl = 'https://emr-test.example.com/fhir';

    /**
     * Set up test environment.
     *
     * @return void
     */
    protected function setUp(): void
    {
        parent::setUp();

        // Initialize mock handler
        $this->mockHandler = new MockHandler();
        $handlerStack = HandlerStack::create($this->mockHandler);
        
        // Create HTTP client with mock handler
        $this->httpClient = new Client([
            'handler' => $handlerStack,
            'base_uri' => $this->baseUrl
        ]);

        // Initialize FHIRService with test configuration
        $this->fhirService = new FHIRService($this->baseUrl, [
            'timeout' => 30,
            'verify_ssl' => true,
            'version' => '4.0.1',
            'api_token' => 'test_token'
        ]);
    }

    /**
     * Test FHIR resource conversion with PHI protection
     *
     * @return void
     */
    public function testSecureConversion(): void
    {
        // Create test health record
        $healthRecord = new HealthRecord([
            'health_data' => [
                'medical_history' => [
                    ['condition' => 'Hypertension', 'code' => 'I10'],
                ],
                'current_medications' => [
                    ['name' => 'Lisinopril', 'code' => 'RxNorm:314076'],
                ]
            ],
            'verified' => true
        ]);

        // Convert to FHIR
        $fhirData = $this->fhirService->convertToFHIR($healthRecord, 'Patient');

        // Verify FHIR structure
        $this->assertEquals('Patient', $fhirData['resourceType']);
        $this->assertArrayHasKey('id', $fhirData);
        $this->assertArrayHasKey('meta', $fhirData);

        // Verify sensitive data encryption
        $this->assertEncrypted($fhirData['medical_history']);
        $this->assertEncrypted($fhirData['current_medications']);

        // Verify audit logging
        $this->assertLoggedActivity('FHIR conversion');
    }

    /**
     * Test EMR data transmission with security headers
     *
     * @return void
     */
    public function testSecureTransmission(): void
    {
        // Mock successful EMR response
        $this->mockHandler->append(
            new Response(201, [
                'Content-Type' => 'application/fhir+json',
                'X-Request-ID' => 'test-123'
            ], json_encode([
                'resourceType' => 'Patient',
                'id' => 'test-patient-id'
            ]))
        );

        // Create test FHIR data
        $fhirData = [
            'resourceType' => 'Patient',
            'id' => 'test-id',
            'meta' => ['versionId' => '1']
        ];

        // Send to EMR
        $response = $this->fhirService->sendToEMR($fhirData, 'Patient');

        // Verify response
        $this->assertArrayHasKey('id', $response);
        $this->assertEquals('test-patient-id', $response['id']);

        // Verify request headers
        $lastRequest = $this->mockHandler->getLastRequest();
        $this->assertEquals('application/fhir+json', $lastRequest->getHeaderLine('Content-Type'));
        $this->assertEquals('4.0.1', $lastRequest->getHeaderLine('X-FHIR-Version'));
        $this->assertTrue($lastRequest->hasHeader('Authorization'));

        // Verify caching
        $this->assertTrue(Cache::has('fhir:Patient:test-id'));
    }

    /**
     * Test circuit breaker functionality
     *
     * @return void
     */
    public function testCircuitBreaker(): void
    {
        // Mock consecutive failures
        for ($i = 0; $i < 6; $i++) {
            $this->mockHandler->append(
                new RequestException(
                    'Server error',
                    new \GuzzleHttp\Psr7\Request('POST', '/fhir/Patient'),
                    new Response(500)
                )
            );
        }

        $fhirData = [
            'resourceType' => 'Patient',
            'id' => 'test-id'
        ];

        // Attempt requests until circuit breaker opens
        for ($i = 0; $i < 5; $i++) {
            try {
                $this->fhirService->sendToEMR($fhirData, 'Patient');
            } catch (\RuntimeException $e) {
                continue;
            }
        }

        // Verify circuit breaker is open
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Circuit breaker is open');
        $this->fhirService->sendToEMR($fhirData, 'Patient');
    }

    /**
     * Test FHIR validation functionality
     *
     * @return void
     */
    public function testFHIRValidation(): void
    {
        // Test valid FHIR resource
        $validResource = [
            'resourceType' => 'Patient',
            'id' => 'test-id',
            'meta' => ['versionId' => '1'],
            'active' => true
        ];
        $this->assertTrue($this->fhirService->validateFHIR($validResource, 'Patient'));

        // Test invalid FHIR resource
        $invalidResource = [
            'id' => 'test-id',
            'active' => true
        ];
        $this->assertFalse($this->fhirService->validateFHIR($invalidResource, 'Patient'));

        // Test invalid resource type
        $this->expectException(\InvalidArgumentException::class);
        $this->fhirService->validateFHIR($validResource, 'InvalidType');
    }

    /**
     * Test EMR data retrieval with caching
     *
     * @return void
     */
    public function testCachedRetrieval(): void
    {
        // Mock EMR response
        $this->mockHandler->append(
            new Response(200, [], json_encode([
                'resourceType' => 'Patient',
                'id' => 'test-id',
                'data' => Crypt::encryptString('sensitive data')
            ]))
        );

        // First request - should hit EMR
        $result1 = $this->fhirService->getFromEMR('Patient', ['id' => 'test-id']);
        $this->assertNotNull($result1);

        // Second request - should hit cache
        $result2 = $this->fhirService->getFromEMR('Patient', ['id' => 'test-id']);
        $this->assertEquals($result1, $result2);

        // Verify cache hit
        $this->assertEquals(1, $this->mockHandler->count());
    }

    /**
     * Helper method to verify data encryption
     *
     * @param mixed $data
     * @return void
     */
    protected function assertEncrypted($data): void
    {
        if (is_array($data)) {
            foreach ($data as $value) {
                $this->assertEncrypted($value);
            }
        } else {
            try {
                Crypt::decryptString($data);
                $this->assertTrue(true);
            } catch (\Exception $e) {
                $this->fail('Data is not properly encrypted');
            }
        }
    }

    /**
     * Helper method to verify audit logging
     *
     * @param string $action
     * @return void
     */
    protected function assertLoggedActivity(string $action): void
    {
        Log::shouldReceive('channel')
            ->with('fhir-audit')
            ->once()
            ->andReturnSelf();

        Log::shouldReceive('info')
            ->with($action, \Mockery::any())
            ->once();
    }
}