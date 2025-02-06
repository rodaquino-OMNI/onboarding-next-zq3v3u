<?php

namespace App\Services\EMR;

use GuzzleHttp\Client;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Crypt;
use App\Models\HealthRecord;
use App\Models\Enrollment;

/**
 * FHIR Service for EMR Integration
 * 
 * Implements FHIR standard for secure health data exchange with EMR systems
 * with HIPAA compliance, encryption, and performance optimization.
 *
 * @package App\Services\EMR
 */
class FHIRService
{
    /** @var string FHIR version */
    private const FHIR_VERSION = '4.0.1';

    /** @var array Supported FHIR resource types */
    private const FHIR_RESOURCE_TYPES = [
        'Patient',
        'Observation',
        'Condition',
        'AllergyIntolerance',
        'MedicationStatement',
        'Procedure',
        'Immunization',
        'DiagnosticReport'
    ];

    /** @var int Cache TTL in seconds */
    private const CACHE_TTL = 3600;

    /** @var int Maximum retry attempts */
    private const MAX_RETRIES = 3;

    /** @var int Circuit breaker threshold */
    private const CIRCUIT_BREAKER_THRESHOLD = 5;

    /** @var Client HTTP client instance */
    private $client;

    /** @var string Base URL for FHIR API */
    private $baseUrl;

    /** @var array Request headers */
    private $headers;

    /** @var array Circuit breaker state */
    private $circuitBreakerState;

    /**
     * Initialize FHIR service with configuration
     *
     * @param string $baseUrl EMR base URL
     * @param array $config Additional configuration
     */
    public function __construct(string $baseUrl, array $config = [])
    {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->circuitBreakerState = [
            'failures' => 0,
            'last_failure' => null,
            'is_open' => false
        ];

        // Configure HTTP client with security settings
        $this->client = new Client([
            'base_uri' => $this->baseUrl,
            'timeout' => $config['timeout'] ?? 30,
            'connect_timeout' => $config['connect_timeout'] ?? 10,
            'verify' => true,
            'http_errors' => false,
            'retry_on_timeout' => true
        ]);

        // Set up secure headers
        $this->headers = [
            'Accept' => 'application/fhir+json',
            'Content-Type' => 'application/fhir+json',
            'X-FHIR-Version' => self::FHIR_VERSION,
            'Authorization' => 'Bearer ' . ($config['api_token'] ?? ''),
            'X-Request-ID' => uniqid('fhir_', true)
        ];
    }

    /**
     * Convert health record to FHIR resource format
     *
     * @param HealthRecord $healthRecord
     * @param string $resourceType
     * @return array
     * @throws \InvalidArgumentException
     */
    public function convertToFHIR(HealthRecord $healthRecord, string $resourceType): array
    {
        if (!in_array($resourceType, self::FHIR_RESOURCE_TYPES)) {
            throw new \InvalidArgumentException("Invalid FHIR resource type: {$resourceType}");
        }

        $healthData = $healthRecord->getHealthData();
        $fhirData = [
            'resourceType' => $resourceType,
            'id' => $healthRecord->id,
            'meta' => [
                'versionId' => '1',
                'lastUpdated' => $healthRecord->updated_at->toIso8601String()
            ],
            'status' => $healthRecord->verified ? 'final' : 'preliminary'
        ];

        // Map health data to FHIR format based on resource type
        switch ($resourceType) {
            case 'Patient':
                $fhirData = array_merge($fhirData, $this->mapPatientData($healthData));
                break;
            case 'Condition':
                $fhirData = array_merge($fhirData, $this->mapConditionData($healthData));
                break;
            case 'MedicationStatement':
                $fhirData = array_merge($fhirData, $this->mapMedicationData($healthData));
                break;
            // Add mappings for other resource types
        }

        // Encrypt sensitive fields
        $fhirData = $this->encryptSensitiveFields($fhirData, $resourceType);

        // Log conversion for audit
        Log::channel('fhir-audit')->info('FHIR conversion', [
            'health_record_id' => $healthRecord->id,
            'resource_type' => $resourceType,
            'user_id' => auth()->id()
        ]);

        return $fhirData;
    }

    /**
     * Send FHIR data to EMR system
     *
     * @param array $fhirData
     * @param string $resourceType
     * @return array
     * @throws \RuntimeException
     */
    public function sendToEMR(array $fhirData, string $resourceType): array
    {
        // Check circuit breaker
        if ($this->isCircuitBreakerOpen()) {
            throw new \RuntimeException('Circuit breaker is open');
        }

        // Validate FHIR data
        if (!$this->validateFHIR($fhirData, $resourceType)) {
            throw new \InvalidArgumentException('Invalid FHIR resource data');
        }

        $retryCount = 0;
        $endpoint = "/fhir/{$resourceType}";

        do {
            try {
                $response = $this->client->post($endpoint, [
                    'headers' => $this->headers,
                    'json' => $fhirData
                ]);

                if ($response->getStatusCode() === 201) {
                    // Reset circuit breaker on success
                    $this->resetCircuitBreaker();
                    
                    $responseData = json_decode($response->getBody(), true);
                    
                    // Cache successful response
                    $cacheKey = "fhir:{$resourceType}:{$fhirData['id']}";
                    Cache::put($cacheKey, $responseData, self::CACHE_TTL);

                    // Log successful transmission
                    Log::channel('fhir-audit')->info('FHIR data sent', [
                        'resource_type' => $resourceType,
                        'resource_id' => $fhirData['id'],
                        'status' => 'success'
                    ]);

                    return $responseData;
                }

                $this->handleFailure();
                $retryCount++;

            } catch (\Exception $e) {
                $this->handleFailure();
                $retryCount++;
                
                Log::channel('fhir-audit')->error('FHIR transmission error', [
                    'error' => $e->getMessage(),
                    'retry_count' => $retryCount
                ]);
            }
        } while ($retryCount < self::MAX_RETRIES);

        throw new \RuntimeException('Failed to send FHIR data after max retries');
    }

    /**
     * Retrieve FHIR resources from EMR
     *
     * @param string $resourceType
     * @param array $parameters
     * @return array
     */
    public function getFromEMR(string $resourceType, array $parameters = []): array
    {
        $cacheKey = "fhir:{$resourceType}:" . md5(serialize($parameters));

        // Check cache first
        if (Cache::has($cacheKey)) {
            return Cache::get($cacheKey);
        }

        // Check circuit breaker
        if ($this->isCircuitBreakerOpen()) {
            throw new \RuntimeException('Circuit breaker is open');
        }

        try {
            $response = $this->client->get("/fhir/{$resourceType}", [
                'headers' => $this->headers,
                'query' => $parameters
            ]);

            if ($response->getStatusCode() === 200) {
                $data = json_decode($response->getBody(), true);
                
                // Decrypt sensitive fields
                $data = $this->decryptSensitiveFields($data, $resourceType);
                
                // Cache response
                Cache::put($cacheKey, $data, self::CACHE_TTL);
                
                // Log successful retrieval
                Log::channel('fhir-audit')->info('FHIR data retrieved', [
                    'resource_type' => $resourceType,
                    'parameters' => $parameters
                ]);

                return $data;
            }

            $this->handleFailure();
            throw new \RuntimeException('Failed to retrieve FHIR data');

        } catch (\Exception $e) {
            $this->handleFailure();
            Log::channel('fhir-audit')->error('FHIR retrieval error', [
                'error' => $e->getMessage()
            ]);
            throw $e;
        }
    }

    /**
     * Validate FHIR resource structure
     *
     * @param array $resource
     * @param string $resourceType
     * @return bool
     */
    public function validateFHIR(array $resource, string $resourceType): bool
    {
        // Basic structure validation
        if (!isset($resource['resourceType']) || $resource['resourceType'] !== $resourceType) {
            return false;
        }

        // Validate required fields based on resource type
        $requiredFields = $this->getRequiredFields($resourceType);
        foreach ($requiredFields as $field) {
            if (!isset($resource[$field])) {
                return false;
            }
        }

        // Validate data types and formats
        try {
            $this->validateDataTypes($resource, $resourceType);
            return true;
        } catch (\Exception $e) {
            Log::channel('fhir-audit')->warning('FHIR validation failed', [
                'resource_type' => $resourceType,
                'error' => $e->getMessage()
            ]);
            return false;
        }
    }

    /**
     * Map patient data to FHIR format
     *
     * @param array $healthData
     * @return array
     */
    private function mapPatientData(array $healthData): array
    {
        return [
            'identifier' => [
                [
                    'system' => 'urn:oid:2.16.840.1.113883.2.9.4.3.2',
                    'value' => $healthData['id_number'] ?? null
                ]
            ],
            'active' => true,
            'name' => [
                [
                    'use' => 'official',
                    'family' => $healthData['last_name'] ?? null,
                    'given' => [$healthData['first_name'] ?? null]
                ]
            ],
            'gender' => $healthData['gender'] ?? null,
            'birthDate' => $healthData['birth_date'] ?? null
        ];
    }

    /**
     * Map condition data to FHIR format
     *
     * @param array $healthData
     * @return array
     */
    private function mapConditionData(array $healthData): array
    {
        $conditions = [];
        foreach ($healthData['medical_history'] ?? [] as $condition) {
            $conditions[] = [
                'clinicalStatus' => [
                    'coding' => [
                        [
                            'system' => 'http://terminology.hl7.org/CodeSystem/condition-clinical',
                            'code' => $condition['active'] ? 'active' : 'resolved'
                        ]
                    ]
                ],
                'code' => [
                    'coding' => [
                        [
                            'system' => 'http://snomed.info/sct',
                            'code' => $condition['code'] ?? null,
                            'display' => $condition['description'] ?? null
                        ]
                    ]
                ],
                'onsetDateTime' => $condition['onset_date'] ?? null
            ];
        }
        return ['condition' => $conditions];
    }

    /**
     * Map medication data to FHIR format
     *
     * @param array $healthData
     * @return array
     */
    private function mapMedicationData(array $healthData): array
    {
        $medications = [];
        foreach ($healthData['current_medications'] ?? [] as $medication) {
            $medications[] = [
                'status' => 'active',
                'medicationCodeableConcept' => [
                    'coding' => [
                        [
                            'system' => 'http://www.nlm.nih.gov/research/umls/rxnorm',
                            'code' => $medication['code'] ?? null,
                            'display' => $medication['name'] ?? null
                        ]
                    ]
                ],
                'dosage' => [
                    [
                        'text' => $medication['dosage'] ?? null,
                        'timing' => [
                            'repeat' => [
                                'frequency' => $medication['frequency'] ?? null,
                                'period' => $medication['period'] ?? null,
                                'periodUnit' => $medication['period_unit'] ?? null
                            ]
                        ]
                    ]
                ]
            ];
        }
        return ['medicationStatement' => $medications];
    }

    /**
     * Encrypt sensitive fields in FHIR resource
     *
     * @param array $data
     * @param string $resourceType
     * @return array
     */
    private function encryptSensitiveFields(array $data, string $resourceType): array
    {
        $sensitiveFields = $this->getSensitiveFields($resourceType);
        foreach ($sensitiveFields as $field) {
            if (isset($data[$field])) {
                $data[$field] = Crypt::encryptString(json_encode($data[$field]));
            }
        }
        return $data;
    }

    /**
     * Decrypt sensitive fields in FHIR resource
     *
     * @param array $data
     * @param string $resourceType
     * @return array
     */
    private function decryptSensitiveFields(array $data, string $resourceType): array
    {
        $sensitiveFields = $this->getSensitiveFields($resourceType);
        foreach ($sensitiveFields as $field) {
            if (isset($data[$field])) {
                $data[$field] = json_decode(Crypt::decryptString($data[$field]), true);
            }
        }
        return $data;
    }

    /**
     * Get required fields for FHIR resource type
     *
     * @param string $resourceType
     * @return array
     */
    private function getRequiredFields(string $resourceType): array
    {
        $requiredFields = [
            'Patient' => ['id', 'resourceType'],
            'Condition' => ['id', 'resourceType', 'subject'],
            'MedicationStatement' => ['id', 'resourceType', 'subject', 'status']
        ];
        return $requiredFields[$resourceType] ?? [];
    }

    /**
     * Get sensitive fields for FHIR resource type
     *
     * @param string $resourceType
     * @return array
     */
    private function getSensitiveFields(string $resourceType): array
    {
        $sensitiveFields = [
            'Patient' => ['identifier', 'name', 'telecom', 'address'],
            'Condition' => ['note', 'evidence'],
            'MedicationStatement' => ['note', 'dosage']
        ];
        return $sensitiveFields[$resourceType] ?? [];
    }

    /**
     * Handle API failure and update circuit breaker
     *
     * @return void
     */
    private function handleFailure(): void
    {
        $this->circuitBreakerState['failures']++;
        $this->circuitBreakerState['last_failure'] = time();
        
        if ($this->circuitBreakerState['failures'] >= self::CIRCUIT_BREAKER_THRESHOLD) {
            $this->circuitBreakerState['is_open'] = true;
        }
    }

    /**
     * Check if circuit breaker is open
     *
     * @return bool
     */
    private function isCircuitBreakerOpen(): bool
    {
        if (!$this->circuitBreakerState['is_open']) {
            return false;
        }

        // Check if enough time has passed to try again
        $cooldownPeriod = 300; // 5 minutes
        if (time() - $this->circuitBreakerState['last_failure'] > $cooldownPeriod) {
            $this->resetCircuitBreaker();
            return false;
        }

        return true;
    }

    /**
     * Reset circuit breaker state
     *
     * @return void
     */
    private function resetCircuitBreaker(): void
    {
        $this->circuitBreakerState = [
            'failures' => 0,
            'last_failure' => null,
            'is_open' => false
        ];
    }
}