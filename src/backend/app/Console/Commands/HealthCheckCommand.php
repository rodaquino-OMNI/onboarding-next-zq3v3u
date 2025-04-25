<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

class HealthCheckCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'health:check';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Check the health of the application and its dependencies';

    /**
     * Execute the console command.
     *
     * @return int
     */
    public function handle()
    {
        try {
            // Check database connection
            DB::connection()->getPdo();
            $this->info('Database connection: OK');
            
            // Try a basic query
            DB::select('SELECT 1');
            $this->info('Database query: OK');

            // Check Redis connection if configured
            try {
                Redis::ping();
                $this->info('Redis connection: OK');
            } catch (\Exception $e) {
                $this->warn('Redis connection: Not available - ' . $e->getMessage());
            }

            // Check storage directory is writable
            if (is_writable(storage_path())) {
                $this->info('Storage directory: Writable');
            } else {
                $this->error('Storage directory: Not writable');
                return 1;
            }

            $this->info('All health checks passed!');
            return 0;
        } catch (\Exception $e) {
            $this->error('Health check failed: ' . $e->getMessage());
            return 1;
        }
    }
}