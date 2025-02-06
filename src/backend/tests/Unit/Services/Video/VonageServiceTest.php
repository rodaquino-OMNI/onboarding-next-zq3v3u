<?php

namespace Tests\Unit\Services\Video;

use Tests\TestCase;
use App\Services\Video\VonageService;
use OpenTok\OpenTok;
use OpenTok\Session;
use OpenTok\Role;
use OpenTok\MediaMode;
use OpenTok\ArchiveMode;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Log;
use Mockery;
use InvalidArgumentException;

class VonageServiceTest extends TestCase
{
    /**
     * @var VonageService
     */
    private VonageService $service;

    /**
     * @var OpenTok|Mockery\MockInterface
     */
    private $mockOpenTok;

    /**
     * @var string
     */
    private string $testSessionId = 'test_session_123';

    /**
     * @var array
     */
    private array $testRegionConfig = [
        'defaultRegion' => 'sa-east-1',
        'fallbackRegions' => ['us-east-1', 'eu-west-1']
    ];

    /**
     * Set up test environment
     */
    protected function setUp(): void
    {
        parent::setUp();

        // Configure test environment
        Config::set('services.vonage.key', 'test_key');
        Config::set('services.vonage.secret', 'test_secret');
        Config::set('services.vonage.allowed_ips', ['127.0.0.1']);

        // Mock OpenTok client
        $this->mockOpenTok = Mockery::mock(OpenTok::class);
        
        // Create service instance with mocked dependencies
        $this->service = new VonageService();
        $this->setPrivateProperty($this->service, 'client', $this->mockOpenTok);
    }

    /**
     * Clean up test environment
     */
    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /**
     * Test session creation with valid parameters
     */
    public function testCreateSession(): void
    {
        // Mock session object
        $mockSession = Mockery::mock(Session::class);
        $mockSession->shouldReceive('getSessionId')
            ->once()
            ->andReturn($this->testSessionId);

        // Set up expectations for OpenTok client
        $this->mockOpenTok->shouldReceive('createSession')
            ->once()
            ->with(Mockery::on(function ($options) {
                return $options['mediaMode'] === 'routed' &&
                    $options['location'] === 'sa-east-1' &&
                    $options['archiveMode'] === ArchiveMode::MANUAL;
            }))
            ->andReturn($mockSession);

        // Execute test
        $result = $this->service->createSession([
            'mediaMode' => 'routed',
            'location' => 'sa-east-1'
        ]);

        // Verify response structure
        $this->assertIsArray($result);
        $this->assertArrayHasKey('sessionId', $result);
        $this->assertArrayHasKey('region', $result);
        $this->assertArrayHasKey('mediaMode', $result);
        $this->assertArrayHasKey('createdAt', $result);
        $this->assertArrayHasKey('configuration', $result);
        $this->assertEquals($this->testSessionId, $result['sessionId']);
        $this->assertEquals('sa-east-1', $result['region']);
    }

    /**
     * Test token generation with valid parameters
     */
    public function testGenerateToken(): void
    {
        $role = 'interviewer';
        $expectedToken = 'T1==test_token';
        $testData = ['name' => 'Dr. Smith'];

        // Set up expectations for OpenTok client
        $this->mockOpenTok->shouldReceive('generateToken')
            ->once()
            ->with(
                $this->testSessionId,
                Mockery::on(function ($options) use ($role) {
                    return $options['role'] === $role &&
                        isset($options['expireTime']) &&
                        isset($options['data']);
                })
            )
            ->andReturn($expectedToken);

        // Execute test
        $result = $this->service->generateToken($this->testSessionId, $role, $testData);

        // Verify response structure
        $this->assertIsArray($result);
        $this->assertArrayHasKey('token', $result);
        $this->assertArrayHasKey('role', $result);
        $this->assertArrayHasKey('expiresAt', $result);
        $this->assertArrayHasKey('permissions', $result);
        $this->assertEquals($expectedToken, $result['token']);
        $this->assertEquals($role, $result['role']);
    }

    /**
     * Test session termination
     */
    public function testEndSession(): void
    {
        // Set up expectations for OpenTok client
        $this->mockOpenTok->shouldReceive('forceDisconnect')
            ->once()
            ->with($this->testSessionId)
            ->andReturn(true);

        // Execute test
        $result = $this->service->endSession($this->testSessionId);

        // Verify response structure
        $this->assertIsArray($result);
        $this->assertArrayHasKey('sessionId', $result);
        $this->assertArrayHasKey('terminatedAt', $result);
        $this->assertArrayHasKey('status', $result);
        $this->assertArrayHasKey('cleanup', $result);
        $this->assertEquals('terminated', $result['status']);
        $this->assertEquals($this->testSessionId, $result['sessionId']);
    }

    /**
     * Test session status retrieval
     */
    public function testGetSessionStatus(): void
    {
        // Mock stream list
        $mockStreams = Mockery::mock();
        $mockStreams->shouldReceive('getItems')
            ->once()
            ->andReturn([
                ['id' => 'stream1', 'videoType' => 'camera'],
                ['id' => 'stream2', 'videoType' => 'camera']
            ]);

        // Set up expectations for OpenTok client
        $this->mockOpenTok->shouldReceive('listStreams')
            ->once()
            ->with($this->testSessionId)
            ->andReturn($mockStreams);

        // Execute test
        $result = $this->service->getSessionStatus($this->testSessionId);

        // Verify response structure
        $this->assertIsArray($result);
        $this->assertArrayHasKey('sessionId', $result);
        $this->assertArrayHasKey('activeConnections', $result);
        $this->assertArrayHasKey('healthStatus', $result);
        $this->assertArrayHasKey('participants', $result);
        $this->assertArrayHasKey('metrics', $result);
        $this->assertArrayHasKey('timestamp', $result);
        $this->assertEquals(2, $result['activeConnections']);
        $this->assertEquals($this->testSessionId, $result['sessionId']);
    }

    /**
     * Test invalid session creation parameters
     */
    public function testInvalidSessionCreation(): void
    {
        $this->expectException(InvalidArgumentException::class);

        $this->service->createSession([
            'mediaMode' => 'invalid_mode'
        ]);
    }

    /**
     * Test invalid token role
     */
    public function testInvalidTokenRole(): void
    {
        $this->expectException(InvalidArgumentException::class);

        $this->service->generateToken(
            $this->testSessionId,
            'invalid_role',
            []
        );
    }

    /**
     * Test session creation with regional failover
     */
    public function testRegionalFailover(): void
    {
        // Mock session with primary region failure
        $this->mockOpenTok->shouldReceive('createSession')
            ->once()
            ->with(Mockery::on(function ($options) {
                return $options['location'] === 'sa-east-1';
            }))
            ->andThrow(new \OpenTok\Exception\Exception('Region unavailable'));

        // Mock successful session creation with failover region
        $mockSession = Mockery::mock(Session::class);
        $mockSession->shouldReceive('getSessionId')
            ->once()
            ->andReturn($this->testSessionId);

        $this->mockOpenTok->shouldReceive('createSession')
            ->once()
            ->with(Mockery::on(function ($options) {
                return $options['location'] === 'us-east-1';
            }))
            ->andReturn($mockSession);

        $result = $this->service->createSession([
            'location' => 'sa-east-1'
        ]);

        $this->assertEquals('us-east-1', $result['region']);
    }

    /**
     * Helper method to set private properties
     */
    private function setPrivateProperty($object, string $property, $value): void
    {
        $reflection = new \ReflectionClass(get_class($object));
        $property = $reflection->getProperty($property);
        $property->setAccessible(true);
        $property->setValue($object, $value);
    }
}