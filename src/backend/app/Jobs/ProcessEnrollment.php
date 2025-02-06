<?php

namespace App\Jobs;

use App\Models\Enrollment;
use App\Services\EMR\FHIRService;
use App\Services\Webhook\WebhookService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Sentry\Laravel\Facade as Sentry;

/**
 * ProcessEnrollment Job
 *
 * Handles asynchronous processing of healthcare enrollment applications with
 * HIPAA compliance, EMR integration via FHIR, and secure webhook notifications.
 *
 * @package App\Jobs
 * @version 1.0.0
 */
class ProcessEnrollment implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    /**
     * The enrollment instance.
     *
     * @var Enrollment
     */
    protected Enrollment $enrollment;

    /**
     * The FHIR service instance.
     *
     * @var FHIRService
     */
    protected FHIRService $fhirService;

    /**
     * The webhook service instance.
     *
     * @var WebhookService
     */
    protected WebhookService $webhookService;

    /**
     * The number of times the job may be attempted.
     *
     * @var int
     */
    public $tries = 3;

    /**
     * The number of seconds the job can run before timing out.
     *
     * @var int
     */
    public $timeout = 3600;

    /**
     * The maximum number of unhandled exceptions to allow before failing.
     *
     * @var int
     */
    public $maxExceptions = 3;

    /**
     * The number of seconds to wait before retrying the job.
     *
     * @var array
     */
    public $backoff = [60, 300, 600];

    /**
     * Delete the job if its models no longer exist.
     *
     * @var bool
     */
    public $deleteWhenMissingModels = true;

    /**
     * Create a new job instance.
     *
     * @param Enrollment $enrollment
     * @param FHIRService $fhirService
     * @param WebhookService $webhookService
     * @return void
     */
    public function __construct(
        Enrollment $enrollment,
        FHIRService $fhirService,
        WebhookService $webhookService
    ) {
        $this->enrollment = $enrollment;
        $this->fhirService = $fhirService;
        $this->webhookService = $webhookService;

        // Set up monitoring context
        Sentry::configureScope(function ($scope) {
            $scope->setExtra('enrollment_id', $enrollment->id);
            $scope->setExtra('user_id', $enrollment->user_id);
        });
    }

    /**
     * Execute the job.
     *
     * @return void
     * @throws \App\Exceptions\EnrollmentProcessingException
     * @throws \App\Exceptions\EMRIntegrationException
     */
    public function handle(): void
    {
        $startTime = microtime(true);

        DB::beginTransaction();
        try {
            // Log processing start
            Log::info('Starting enrollment processing', [
                'enrollment_id' => $this->enrollment->id,
                'status' => $this->enrollment->status
            ]);

            // Validate required documents
            $documents = $this->enrollment->documents()
                ->where('status', 'processed')
                ->count();

            if ($documents < config('enrollment.required_documents_count')) {
                throw new \App\Exceptions\EnrollmentProcessingException(
                    'Missing required documents'
                );
            }

            // Process health records
            $healthRecords = $this->enrollment->healthRecords()
                ->where('verified', true)
                ->get();

            // Convert health records to FHIR format
            $fhirData = [];
            foreach ($healthRecords as $record) {
                $fhirResource = $this->fhirService->convertToFHIR(
                    $record,
                    'Patient'
                );

                // Validate FHIR compliance
                if (!$this->fhirService->validateFHIR($fhirResource, 'Patient')) {
                    throw new \App\Exceptions\EMRIntegrationException(
                        'Invalid FHIR data format'
                    );
                }

                $fhirData[] = $fhirResource;
            }

            // Send to EMR system
            foreach ($fhirData as $resource) {
                $response = $this->fhirService->sendToEMR($resource, 'Patient');
                
                if (empty($response)) {
                    throw new \App\Exceptions\EMRIntegrationException(
                        'Failed to integrate with EMR system'
                    );
                }
            }

            // Check if medical interview is required
            if ($this->enrollment->requiresInterview()) {
                $this->enrollment->updateStatus('interview_scheduled');
            } else {
                $this->enrollment->updateStatus('completed');
            }

            // Cache processed results
            $cacheKey = "enrollment:{$this->enrollment->id}:processed";
            Cache::tags(['enrollments'])->put($cacheKey, true, now()->addDay());

            // Send webhook notification
            $this->webhookService->dispatchEvent('enrollment.updated', [
                'enrollment_id' => $this->enrollment->id,
                'status' => $this->enrollment->status,
                'processed_at' => now()->toIso8601String()
            ]);

            DB::commit();

            // Log successful completion with metrics
            $duration = round((microtime(true) - $startTime) * 1000);
            Log::info('Enrollment processing completed', [
                'enrollment_id' => $this->enrollment->id,
                'status' => $this->enrollment->status,
                'duration_ms' => $duration
            ]);

        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }
    }

    /**
     * Handle a job failure.
     *
     * @param \Throwable $exception
     * @return void
     */
    public function failed(\Throwable $exception): void
    {
        // Log detailed error information
        Log::error('Enrollment processing failed', [
            'enrollment_id' => $this->enrollment->id,
            'exception' => $exception->getMessage(),
            'trace' => $exception->getTraceAsString()
        ]);

        // Capture error in Sentry
        Sentry::captureException($exception);

        // Update enrollment status to failure
        $this->enrollment->updateStatus('documents_pending');

        // Send failure notification via webhook
        $this->webhookService->dispatchEvent('enrollment.failed', [
            'enrollment_id' => $this->enrollment->id,
            'error' => $exception->getMessage(),
            'failed_at' => now()->toIso8601String()
        ]);

        // Clean up any cached data
        Cache::tags(['enrollments'])->forget(
            "enrollment:{$this->enrollment->id}:processed"
        );
    }
}