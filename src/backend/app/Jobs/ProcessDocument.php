<?php

namespace App\Jobs;

use App\Models\Document;
use App\Services\AWS\TextractService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Log;
use Exception;

/**
 * ProcessDocument Job
 * 
 * Handles asynchronous OCR processing of healthcare enrollment documents
 * using AWS Textract with HIPAA compliance and enhanced security measures.
 *
 * @implements ShouldQueue
 */
class ProcessDocument implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    /**
     * Document model instance
     *
     * @var Document
     */
    private Document $document;

    /**
     * TextractService instance
     *
     * @var TextractService
     */
    private TextractService $textractService;

    /**
     * Maximum number of attempts for the job
     *
     * @var int
     */
    public $tries = 3;

    /**
     * Timeout in seconds
     *
     * @var int
     */
    public $timeout = 600;

    /**
     * Time between retries in seconds
     *
     * @var int
     */
    public $backoff = 60;

    /**
     * Required OCR accuracy threshold
     *
     * @var float
     */
    private float $accuracyThreshold = 0.99;

    /**
     * Allowed document file types
     *
     * @var array<string>
     */
    private array $allowedDocumentTypes = ['pdf', 'jpg', 'png'];

    /**
     * Create a new job instance.
     *
     * @param Document $document
     * @return void
     * @throws \InvalidArgumentException
     */
    public function __construct(Document $document)
    {
        $this->document = $document;
        $this->textractService = new TextractService();

        // Set unique job ID for tracking
        $this->job = "doc_ocr_{$document->id}_" . uniqid();

        // Configure queue settings
        $this->onQueue('documents');
        $this->afterCommit();

        // Initialize logging context
        Log::withContext([
            'job_id' => $this->job,
            'document_id' => $document->id,
            'enrollment_id' => $document->enrollment_id
        ]);
    }

    /**
     * Execute the job.
     *
     * @return void
     * @throws Exception
     */
    public function handle(): void
    {
        try {
            Log::info('Starting document OCR processing', [
                'attempt' => $this->attempts(),
                'document_type' => $this->document->type
            ]);

            // Validate document accessibility
            if (!$this->document->exists()) {
                throw new Exception('Document not found or inaccessible');
            }

            // Get secure document URL with short expiry
            $documentUrl = $this->document->getStorageUrl(
                5,
                'ocr_processing_job_' . $this->job
            );

            // Process document through Textract
            $ocrResults = $this->textractService->processDocument($this->document);

            // Validate OCR results
            if (!isset($ocrResults['confidence']) || 
                $ocrResults['confidence'] < $this->accuracyThreshold) {
                throw new Exception(
                    "OCR confidence below required threshold: {$ocrResults['confidence']}"
                );
            }

            // Update document with OCR results
            $this->document->markAsProcessed([
                'confidence' => $ocrResults['confidence'],
                'data' => $ocrResults['data'],
                'processed_by' => 'textract_job_' . $this->job,
                'processed_at' => now()
            ]);

            Log::info('Document OCR processing completed', [
                'confidence' => $ocrResults['confidence'],
                'processing_time' => $this->job->timeElapsed()
            ]);

        } catch (Exception $e) {
            Log::error('Document OCR processing failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);

            // Handle specific error types
            if ($e instanceof \Aws\Exception\AwsException) {
                $this->handleAwsError($e);
            }

            throw $e;
        }
    }

    /**
     * Handle a job failure.
     *
     * @param Exception $exception
     * @return void
     */
    public function failed(Exception $exception): void
    {
        Log::error('Document OCR job failed', [
            'error' => $exception->getMessage(),
            'trace' => $exception->getTraceAsString()
        ]);

        // Update document status
        $this->document->markAsFailed([
            'error' => $exception->getMessage(),
            'job_id' => $this->job,
            'attempts' => $this->attempts()
        ]);

        // Notify relevant parties
        if ($this->attempts() >= $this->tries) {
            event(new DocumentProcessingFailed($this->document, $exception));
        }
    }

    /**
     * Handle AWS specific errors.
     *
     * @param \Aws\Exception\AwsException $exception
     * @return void
     */
    private function handleAwsError(\Aws\Exception\AwsException $exception): void
    {
        $errorCode = $exception->getAwsErrorCode();
        $shouldRetry = in_array($errorCode, [
            'ThrottlingException',
            'ProvisionedThroughputExceededException',
            'RequestLimitExceeded'
        ]);

        if ($shouldRetry && $this->attempts() < $this->tries) {
            $this->release($this->backoff * $this->attempts());
        } else {
            $this->fail($exception);
        }
    }
}