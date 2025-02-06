<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;
use App\Jobs\ProcessDocument;
use App\Jobs\ProcessEnrollment;
use App\Jobs\SendWebhook;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

/**
 * Console Kernel for AUSTA Integration Platform
 * 
 * Implements comprehensive task scheduling, queue monitoring, and system maintenance
 * with enhanced error handling and performance optimization.
 *
 * @package App\Console
 * @version 1.0.0
 */
class Kernel extends ConsoleKernel
{
    /**
     * The Artisan commands provided by your application.
     *
     * @var array
     */
    protected $commands = [];

    /**
     * Define the application's command schedule.
     *
     * @param  \Illuminate\Console\Scheduling\Schedule  $schedule
     * @return void
     */
    protected function schedule(Schedule $schedule)
    {
        // Document Processing Queue Monitoring
        $schedule->call(function () {
            $this->monitorDocumentQueue();
        })->everyMinute()
          ->withoutOverlapping()
          ->onOneServer()
          ->appendOutputTo(storage_path('logs/document-queue.log'));

        // Enrollment Processing Queue Monitoring
        $schedule->call(function () {
            $this->monitorEnrollmentQueue();
        })->everyMinute()
          ->withoutOverlapping()
          ->onOneServer()
          ->appendOutputTo(storage_path('logs/enrollment-queue.log'));

        // Webhook Delivery Retries
        $schedule->call(function () {
            $this->processFailedWebhooks();
        })->everyFiveMinutes()
          ->withoutOverlapping()
          ->onOneServer()
          ->appendOutputTo(storage_path('logs/webhook-retries.log'));

        // Failed Jobs Cleanup
        $schedule->command('queue:flush')
                ->daily()
                ->at('00:00')
                ->onOneServer()
                ->emailOutputOnFailure(config('mail.admin_address'));

        // Temporary Files Cleanup
        $schedule->call(function () {
            $this->cleanupTemporaryFiles();
        })->daily()
          ->at('01:00')
          ->onOneServer();

        // Database Backup
        $schedule->command('backup:run --only-db')
                ->daily()
                ->at('02:00')
                ->onOneServer()
                ->before(function () {
                    Log::info('Starting database backup');
                })
                ->after(function () {
                    $this->verifyBackup();
                });

        // Health Checks
        $schedule->call(function () {
            $this->performHealthChecks();
        })->everyMinute()
          ->withoutOverlapping(5)
          ->onOneServer();

        // Cache Cleanup
        $schedule->command('cache:prune-stale-tags')
                ->hourly()
                ->onOneServer();

        // Metrics Collection
        $schedule->call(function () {
            $this->collectSystemMetrics();
        })->everyFiveMinutes()
          ->withoutOverlapping()
          ->onOneServer();

        // Circuit Breaker Reset
        $schedule->call(function () {
            $this->resetCircuitBreakers();
        })->hourly()
          ->onOneServer();
    }

    /**
     * Register the commands for the application.
     *
     * @return void
     */
    protected function commands()
    {
        $this->load(__DIR__.'/Commands');
    }

    /**
     * Monitor document processing queue health.
     *
     * @return void
     */
    private function monitorDocumentQueue(): void
    {
        try {
            $queueSize = DB::table('jobs')
                ->where('queue', 'documents')
                ->count();

            $failedJobs = DB::table('failed_jobs')
                ->where('queue', 'documents')
                ->where('failed_at', '>=', now()->subHours(24))
                ->count();

            if ($queueSize > 1000 || $failedJobs > 50) {
                Log::alert('Document queue health check failed', [
                    'queue_size' => $queueSize,
                    'failed_jobs' => $failedJobs
                ]);
            }

            // Update metrics
            Cache::put('metrics:document_queue_size', $queueSize, now()->addMinutes(10));
            Cache::put('metrics:document_failed_jobs', $failedJobs, now()->addMinutes(10));

        } catch (\Exception $e) {
            Log::error('Document queue monitoring failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
        }
    }

    /**
     * Monitor enrollment processing queue health.
     *
     * @return void
     */
    private function monitorEnrollmentQueue(): void
    {
        try {
            $stuckEnrollments = DB::table('enrollments')
                ->where('status', 'processing')
                ->where('updated_at', '<=', now()->subHours(1))
                ->count();

            if ($stuckEnrollments > 0) {
                Log::alert('Stuck enrollments detected', [
                    'count' => $stuckEnrollments
                ]);
            }

            // Check for failed processing
            $failedProcessing = DB::table('failed_jobs')
                ->where('queue', 'enrollments')
                ->where('failed_at', '>=', now()->subHours(24))
                ->get();

            foreach ($failedProcessing as $failed) {
                ProcessEnrollment::dispatch(json_decode($failed->payload, true))
                    ->onQueue('enrollments')
                    ->delay(now()->addMinutes(15));
            }

        } catch (\Exception $e) {
            Log::error('Enrollment queue monitoring failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
        }
    }

    /**
     * Process failed webhook deliveries.
     *
     * @return void
     */
    private function processFailedWebhooks(): void
    {
        try {
            $failedWebhooks = DB::table('failed_jobs')
                ->where('queue', 'webhooks')
                ->where('failed_at', '>=', now()->subHours(24))
                ->get();

            foreach ($failedWebhooks as $webhook) {
                $payload = json_decode($webhook->payload, true);
                
                SendWebhook::dispatch(
                    $payload['webhookUrl'],
                    $payload['event'],
                    $payload['data'],
                    $payload['secret']
                )->onQueue('webhooks-retry')
                  ->delay(now()->addMinutes(rand(5, 15)));
            }

        } catch (\Exception $e) {
            Log::error('Webhook retry processing failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
        }
    }

    /**
     * Perform system health checks.
     *
     * @return void
     */
    private function performHealthChecks(): void
    {
        try {
            // Check database connection
            DB::connection()->getPdo();

            // Check Redis connection
            Cache::store('redis')->set('health_check', true, 10);

            // Check queue processing
            $queueBacklog = DB::table('jobs')->count();
            if ($queueBacklog > 5000) {
                Log::warning('High queue backlog detected', [
                    'backlog_size' => $queueBacklog
                ]);
            }

            // Check disk usage
            $diskUsage = disk_free_space('/') / disk_total_space('/');
            if ($diskUsage < 0.2) {
                Log::alert('Low disk space warning', [
                    'free_space_percentage' => $diskUsage * 100
                ]);
            }

        } catch (\Exception $e) {
            Log::emergency('Health check failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
        }
    }

    /**
     * Collect and store system metrics.
     *
     * @return void
     */
    private function collectSystemMetrics(): void
    {
        try {
            $metrics = [
                'queue_size' => DB::table('jobs')->count(),
                'failed_jobs' => DB::table('failed_jobs')
                    ->where('failed_at', '>=', now()->subDay())
                    ->count(),
                'active_enrollments' => DB::table('enrollments')
                    ->where('status', 'processing')
                    ->count(),
                'document_processing_rate' => Cache::get('metrics:document_processing_rate', 0),
                'webhook_delivery_rate' => Cache::get('metrics:webhook_delivery_rate', 0)
            ];

            DB::table('system_metrics')->insert(array_merge(
                $metrics,
                ['created_at' => now()]
            ));

        } catch (\Exception $e) {
            Log::error('Metrics collection failed', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
        }
    }

    /**
     * Reset circuit breakers for services.
     *
     * @return void
     */
    private function resetCircuitBreakers(): void
    {
        $circuitBreakerKeys = [
            'webhook_circuit_*',
            'textract_circuit_*',
            'fhir_circuit_*'
        ];

        foreach ($circuitBreakerKeys as $pattern) {
            $keys = Cache::get($pattern);
            foreach ($keys as $key) {
                if (Cache::get($key . '_last_failure') < now()->subHours(1)) {
                    Cache::forget($key);
                    Cache::forget($key . '_failures');
                    Cache::forget($key . '_last_failure');
                }
            }
        }
    }

    /**
     * Verify database backup integrity.
     *
     * @return void
     */
    private function verifyBackup(): void
    {
        $backupPath = storage_path('app/backups/latest.sql');
        
        if (!file_exists($backupPath)) {
            Log::alert('Database backup verification failed - file not found');
            return;
        }

        if (filesize($backupPath) < 1000) {
            Log::alert('Database backup verification failed - file size too small');
            return;
        }

        Log::info('Database backup verified successfully', [
            'size' => filesize($backupPath),
            'created_at' => filemtime($backupPath)
        ]);
    }

    /**
     * Cleanup temporary files.
     *
     * @return void
     */
    private function cleanupTemporaryFiles(): void
    {
        $directories = [
            storage_path('app/temp'),
            storage_path('app/public/temp'),
            storage_path('logs')
        ];

        foreach ($directories as $directory) {
            if (!is_dir($directory)) {
                continue;
            }

            $files = glob($directory . '/*');
            foreach ($files as $file) {
                if (is_file($file) && time() - filemtime($file) > 86400) {
                    unlink($file);
                }
            }
        }
    }
}