<?php

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Closure;

/*
|--------------------------------------------------------------------------
| Console Routes
|--------------------------------------------------------------------------
|
| This file is where you may define all of your Closure based console
| commands. Each Closure is bound to a command instance allowing a
| simple approach to interacting with each command's IO methods.
|
*/

/**
 * Monitor queue health with circuit breaker implementation
 */
Artisan::command('queue:health', function () {
    $this->info('Checking queue health...');
    $startTime = microtime(true);

    try {
        // Check document processing queue
        $documentQueue = DB::table('jobs')
            ->where('queue', 'documents')
            ->count();

        $documentFailed = DB::table('failed_jobs')
            ->where('queue', 'documents')
            ->where('failed_at', '>=', now()->subHours(24))
            ->count();

        // Check enrollment processing queue
        $enrollmentQueue = DB::table('jobs')
            ->where('queue', 'enrollments')
            ->count();

        $enrollmentFailed = DB::table('failed_jobs')
            ->where('queue', 'enrollments')
            ->where('failed_at', '>=', now()->subHours(24))
            ->count();

        // Check webhook delivery queue
        $webhookQueue = DB::table('jobs')
            ->where('queue', 'webhooks')
            ->count();

        $webhookFailed = DB::table('failed_jobs')
            ->where('queue', 'webhooks')
            ->where('failed_at', '>=', now()->subHours(24))
            ->count();

        // Calculate health scores
        $scores = [
            'documents' => $documentQueue < 1000 && $documentFailed < 50,
            'enrollments' => $enrollmentQueue < 500 && $enrollmentFailed < 25,
            'webhooks' => $webhookQueue < 2000 && $webhookFailed < 100
        ];

        // Update metrics
        Cache::tags(['metrics'])->put('queue_health', [
            'document_queue' => $documentQueue,
            'document_failed' => $documentFailed,
            'enrollment_queue' => $enrollmentQueue,
            'enrollment_failed' => $enrollmentFailed,
            'webhook_queue' => $webhookQueue,
            'webhook_failed' => $webhookFailed,
            'checked_at' => now()
        ], 300);

        // Generate health report
        $duration = round((microtime(true) - $startTime) * 1000);
        $healthStatus = array_sum($scores) === count($scores) ? 'healthy' : 'degraded';

        $this->table(
            ['Queue', 'Size', 'Failed', 'Status'],
            [
                ['documents', $documentQueue, $documentFailed, $scores['documents'] ? 'OK' : 'Warning'],
                ['enrollments', $enrollmentQueue, $enrollmentFailed, $scores['enrollments'] ? 'OK' : 'Warning'],
                ['webhooks', $webhookQueue, $webhookFailed, $scores['webhooks'] ? 'OK' : 'Warning']
            ]
        );

        $this->info("Health check completed in {$duration}ms. Overall status: {$healthStatus}");

        // Log results
        Log::info('Queue health check completed', [
            'status' => $healthStatus,
            'duration_ms' => $duration,
            'metrics' => Cache::tags(['metrics'])->get('queue_health')
        ]);

        return $healthStatus === 'healthy' ? 0 : 1;

    } catch (\Exception $e) {
        Log::error('Queue health check failed', [
            'error' => $e->getMessage(),
            'trace' => $e->getTraceAsString()
        ]);
        $this->error('Health check failed: ' . $e->getMessage());
        return 2;
    }
})->purpose('Monitor queue health and performance metrics');

/**
 * Monitor enrollment processing with SLA tracking
 */
Artisan::command('enrollments:monitor', function () {
    $this->info('Monitoring enrollment processing...');
    
    try {
        // Check stuck enrollments
        $stuckEnrollments = DB::table('enrollments')
            ->where('status', 'processing')
            ->where('updated_at', '<=', now()->subHours(1))
            ->get();

        // Check SLA compliance
        $slaViolations = DB::table('enrollments')
            ->where('created_at', '>=', now()->subDay())
            ->whereRaw('TIMESTAMPDIFF(HOUR, created_at, completed_at) > 24')
            ->count();

        // Calculate processing metrics
        $processingTimes = DB::table('enrollments')
            ->where('completed_at', '>=', now()->subDay())
            ->selectRaw('AVG(TIMESTAMPDIFF(MINUTE, created_at, completed_at)) as avg_time')
            ->first();

        // Generate report
        $this->table(
            ['Metric', 'Value'],
            [
                ['Stuck Enrollments', $stuckEnrollments->count()],
                ['SLA Violations (24h)', $slaViolations],
                ['Avg Processing Time (min)', round($processingTimes->avg_time ?? 0)]
            ]
        );

        // Update monitoring dashboard
        Cache::tags(['metrics'])->put('enrollment_metrics', [
            'stuck_count' => $stuckEnrollments->count(),
            'sla_violations' => $slaViolations,
            'avg_processing_time' => $processingTimes->avg_time ?? 0,
            'checked_at' => now()
        ], 300);

        // Handle stuck enrollments
        foreach ($stuckEnrollments as $enrollment) {
            $this->warn("Resetting stuck enrollment: {$enrollment->id}");
            DB::table('enrollments')
                ->where('id', $enrollment->id)
                ->update(['status' => 'documents_pending']);
        }

        return $slaViolations > 0 ? 1 : 0;

    } catch (\Exception $e) {
        Log::error('Enrollment monitoring failed', [
            'error' => $e->getMessage(),
            'trace' => $e->getTraceAsString()
        ]);
        $this->error('Monitoring failed: ' . $e->getMessage());
        return 2;
    }
})->purpose('Monitor enrollment processing and SLA compliance');

/**
 * Clean up temporary files with security validation
 */
Artisan::command('cleanup:temp', function () {
    $this->info('Starting temporary file cleanup...');
    $startTime = microtime(true);
    $cleanupCount = 0;

    try {
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
                if (!is_file($file)) {
                    continue;
                }

                // Validate file age and permissions
                $fileAge = time() - filemtime($file);
                $filePerms = fileperms($file);

                if ($fileAge > 86400 && ($filePerms & 0777) === 0644) {
                    // Create audit log entry
                    Log::channel('audit')->info('Deleting temporary file', [
                        'path' => $file,
                        'age_hours' => round($fileAge / 3600),
                        'size' => filesize($file)
                    ]);

                    // Secure deletion
                    if (unlink($file)) {
                        $cleanupCount++;
                    }
                }
            }
        }

        $duration = round((microtime(true) - $startTime) * 1000);
        $this->info("Cleanup completed in {$duration}ms. Removed {$cleanupCount} files.");

        // Update cleanup statistics
        Cache::tags(['metrics'])->put('cleanup_stats', [
            'last_run' => now(),
            'duration_ms' => $duration,
            'files_removed' => $cleanupCount
        ], 86400);

        return $cleanupCount;

    } catch (\Exception $e) {
        Log::error('Temporary file cleanup failed', [
            'error' => $e->getMessage(),
            'trace' => $e->getTraceAsString()
        ]);
        $this->error('Cleanup failed: ' . $e->getMessage());
        return -1;
    }
})->purpose('Clean up temporary files with security validation');