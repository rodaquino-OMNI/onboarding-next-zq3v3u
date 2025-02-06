<?php

namespace App\Services\AWS;

use Aws\Textract\TextractClient;
use App\Models\Document;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Config;
use Illuminate\Contracts\Encryption\EncryptionException;
use Aws\Exception\AwsException;
use Exception;

/**
 * Service for processing documents using AWS Textract OCR with HIPAA compliance and high accuracy.
 * 
 * @package App\Services\AWS
 */
class TextractService
{
    /**
     * AWS Textract client instance
     *
     * @var TextractClient
     */
    private TextractClient $client;

    /**
     * Document type specific confidence thresholds
     *
     * @var array<string, float>
     */
    private array $confidenceThresholds = [
        'id_document' => 0.99,
        'proof_of_address' => 0.95,
        'health_declaration' => 0.99
    ];

    /**
     * Rate limiting configuration
     */
    private const RATE_LIMIT_KEY = 'textract_rate_limit';
    private const RATE_LIMIT_MINUTES = 1;
    private const RATE_LIMIT_ATTEMPTS = 100;

    /**
     * Circuit breaker configuration
     */
    private const CIRCUIT_BREAKER_KEY = 'textract_circuit_breaker';
    private const CIRCUIT_BREAKER_THRESHOLD = 5;
    private const CIRCUIT_BREAKER_TIMEOUT = 300; // 5 minutes

    /**
     * Initialize TextractService with AWS configuration
     *
     * @throws Exception If AWS configuration is invalid
     */
    public function __construct()
    {
        try {
            $this->client = new TextractClient([
                'version' => '2018-06-27',
                'region'  => Config::get('services.aws.region'),
                'credentials' => [
                    'key'    => Config::get('services.aws.key'),
                    'secret' => Config::get('services.aws.secret'),
                ],
                'http' => [
                    'timeout' => 120,
                    'connect_timeout' => 30
                ]
            ]);
        } catch (Exception $e) {
            Log::error('TextractService initialization failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            throw $e;
        }
    }

    /**
     * Process document through AWS Textract OCR with security measures
     *
     * @param Document $document Document model instance
     * @return array Processed and validated OCR results
     * @throws Exception If processing fails
     */
    public function processDocument(Document $document): array
    {
        // Check rate limits
        if (!$this->checkRateLimit()) {
            throw new Exception('Rate limit exceeded for OCR processing');
        }

        // Check circuit breaker
        if ($this->isCircuitBreakerOpen()) {
            throw new Exception('OCR service temporarily unavailable');
        }

        try {
            // Log processing start
            Log::info('Starting OCR processing', [
                'document_id' => $document->id,
                'type' => $document->type
            ]);

            // Get secure document URL
            $documentUrl = $document->getStorageUrl(5, 'ocr_processing');

            // Start async document processing
            $result = $this->client->startDocumentAnalysis([
                'DocumentLocation' => [
                    'S3Object' => [
                        'Bucket' => Config::get('services.aws.bucket'),
                        'Name' => $document->storage_path
                    ]
                ],
                'FeatureTypes' => ['FORMS', 'TABLES'],
                'JobTag' => "doc_{$document->id}"
            ]);

            $jobId = $result['JobId'];

            // Poll for completion with timeout
            $maxAttempts = 30;
            $attempt = 0;
            $completed = false;

            while ($attempt < $maxAttempts && !$completed) {
                $status = $this->client->getDocumentAnalysis([
                    'JobId' => $jobId
                ]);

                if ($status['JobStatus'] === 'SUCCEEDED') {
                    $completed = true;
                } elseif ($status['JobStatus'] === 'FAILED') {
                    throw new Exception("OCR job failed: {$status['StatusMessage']}");
                }

                if (!$completed) {
                    sleep(2);
                    $attempt++;
                }
            }

            if (!$completed) {
                throw new Exception('OCR processing timeout');
            }

            // Get and validate results
            $results = $this->getJobResults($jobId);
            
            if (!$this->validateResults($results, $document->type)) {
                throw new Exception('OCR results failed validation');
            }

            // Mark document as processed
            $document->markAsProcessed([
                'confidence' => $results['confidence'],
                'data' => $results['data']
            ]);

            // Reset circuit breaker counter on success
            Cache::put(self::CIRCUIT_BREAKER_KEY, 0, now()->addMinutes(5));

            return $results;

        } catch (AwsException $e) {
            $this->handleFailure($jobId ?? null, $e);
            throw $e;
        } catch (Exception $e) {
            Log::error('OCR processing failed', [
                'document_id' => $document->id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            throw $e;
        }
    }

    /**
     * Validate OCR results against confidence thresholds
     *
     * @param array $results OCR results
     * @param string $documentType Type of document
     * @return bool Validation status
     */
    private function validateResults(array $results, string $documentType): bool
    {
        if (!isset($results['confidence']) || !isset($results['data'])) {
            return false;
        }

        $threshold = $this->confidenceThresholds[$documentType] ?? 0.95;
        return $results['confidence'] >= $threshold;
    }

    /**
     * Get complete results for a Textract job
     *
     * @param string $jobId Textract job ID
     * @return array Processed results
     */
    private function getJobResults(string $jobId): array
    {
        $results = [];
        $nextToken = null;

        do {
            $response = $this->client->getDocumentAnalysis([
                'JobId' => $jobId,
                'NextToken' => $nextToken
            ]);

            foreach ($response['Blocks'] as $block) {
                if ($block['BlockType'] === 'LINE') {
                    $results['data'][] = [
                        'text' => $block['Text'],
                        'confidence' => $block['Confidence'],
                        'page' => $block['Page']
                    ];
                }
            }

            $nextToken = $response['NextToken'] ?? null;
        } while ($nextToken);

        // Calculate overall confidence
        $confidences = array_column($results['data'], 'confidence');
        $results['confidence'] = !empty($confidences) ? min($confidences) : 0;

        return $results;
    }

    /**
     * Handle OCR processing failures
     *
     * @param string|null $jobId Failed job ID
     * @param Exception $error Error details
     * @return void
     */
    private function handleFailure(?string $jobId, Exception $error): void
    {
        // Increment circuit breaker counter
        $failures = Cache::increment(self::CIRCUIT_BREAKER_KEY);

        // Log failure details
        Log::error('OCR processing failure', [
            'job_id' => $jobId,
            'error' => $error->getMessage(),
            'failure_count' => $failures
        ]);

        // Open circuit breaker if threshold reached
        if ($failures >= self::CIRCUIT_BREAKER_THRESHOLD) {
            Cache::put(
                self::CIRCUIT_BREAKER_KEY . '_open',
                true,
                now()->addSeconds(self::CIRCUIT_BREAKER_TIMEOUT)
            );
        }
    }

    /**
     * Check if rate limit is exceeded
     *
     * @return bool Rate limit status
     */
    private function checkRateLimit(): bool
    {
        $attempts = Cache::get(self::RATE_LIMIT_KEY, 0);
        
        if ($attempts >= self::RATE_LIMIT_ATTEMPTS) {
            return false;
        }

        Cache::add(
            self::RATE_LIMIT_KEY,
            0,
            now()->addMinutes(self::RATE_LIMIT_MINUTES)
        );
        
        Cache::increment(self::RATE_LIMIT_KEY);
        return true;
    }

    /**
     * Check if circuit breaker is open
     *
     * @return bool Circuit breaker status
     */
    private function isCircuitBreakerOpen(): bool
    {
        return Cache::get(self::CIRCUIT_BREAKER_KEY . '_open', false);
    }
}