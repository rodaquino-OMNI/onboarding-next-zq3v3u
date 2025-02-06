<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use App\Models\User;
use App\Models\Enrollment;
use App\Models\Interview;
use Carbon\Carbon;

/**
 * Main database seeder for AUSTA Integration Platform
 * Implements HIPAA, GDPR, and LGPD compliant test data generation
 */
class DatabaseSeeder extends Seeder
{
    /**
     * Language distribution for test data
     * 
     * @var array<string, float>
     */
    protected array $languageDistribution = [
        'pt-BR' => 0.7, // 70% Brazilian Portuguese
        'en' => 0.3,    // 30% English
    ];

    /**
     * Enrollment state distribution
     * 
     * @var array<string, float>
     */
    protected array $enrollmentStates = [
        'draft' => 0.15,
        'documents_pending' => 0.20,
        'documents_submitted' => 0.15,
        'health_declaration_pending' => 0.20,
        'interview_scheduled' => 0.15,
        'interview_completed' => 0.10,
        'completed' => 0.05
    ];

    /**
     * Interview status distribution
     * 
     * @var array<string, float>
     */
    protected array $interviewStatuses = [
        'scheduled' => 0.30,
        'completed' => 0.40,
        'cancelled' => 0.15,
        'rescheduled' => 0.10,
        'failed' => 0.05
    ];

    /**
     * Seed the application's database with HIPAA-compliant test data.
     *
     * @return void
     */
    public function run()
    {
        DB::beginTransaction();

        try {
            // Clear tables in test environment
            if (app()->environment('testing', 'local')) {
                $this->truncateTables();
            }

            // Create admin users
            $this->createAdminUsers();

            // Create broker users
            User::factory()
                ->count(10)
                ->role('broker')
                ->withEncryptedData()
                ->create();

            // Create interviewer users with availability settings
            User::factory()
                ->count(20)
                ->role('interviewer')
                ->create()
                ->each(function ($user) {
                    $user->setPreference('availability', [
                        'weekdays' => true,
                        'weekends' => false,
                        'hours' => ['09:00', '17:00']
                    ]);
                });

            // Create individual users with proper language distribution
            foreach ($this->languageDistribution as $language => $percentage) {
                $count = (int) (100 * $percentage);
                User::factory()
                    ->count($count)
                    ->role('individual')
                    ->withEncryptedData()
                    ->create(['language' => $language]);
            }

            // Create enrollments with varied states
            $users = User::where('role', 'individual')->get();
            foreach ($users as $user) {
                $this->createUserEnrollments($user);
            }

            // Create interviews with proper scheduling
            $this->createInterviews();

            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();
            throw $e;
        }
    }

    /**
     * Create admin users with proper language preferences.
     *
     * @return void
     */
    protected function createAdminUsers(): void
    {
        // Create English-speaking admin
        User::factory()
            ->role('admin')
            ->withEncryptedData()
            ->create([
                'name' => 'Admin EN',
                'email' => 'admin.en@austa.health',
                'language' => 'en'
            ]);

        // Create Portuguese-speaking admin
        User::factory()
            ->role('admin')
            ->withEncryptedData()
            ->create([
                'name' => 'Admin PT',
                'email' => 'admin.pt@austa.health',
                'language' => 'pt-BR'
            ]);
    }

    /**
     * Create enrollments for a specific user.
     *
     * @param User $user
     * @return void
     */
    protected function createUserEnrollments(User $user): void
    {
        $enrollmentCount = random_int(1, 3);
        
        for ($i = 0; $i < $enrollmentCount; $i++) {
            $state = $this->getRandomWeighted($this->enrollmentStates);
            
            $enrollment = Enrollment::factory()
                ->withEncryptedData()
                ->withLocale($user->language)
                ->withAuditTrail()
                ->create([
                    'user_id' => $user->id,
                    'status' => $state
                ]);

            if (in_array($state, ['interview_scheduled', 'interview_completed'])) {
                $this->createEnrollmentInterview($enrollment);
            }
        }
    }

    /**
     * Create interview for an enrollment.
     *
     * @param Enrollment $enrollment
     * @return void
     */
    protected function createEnrollmentInterview(Enrollment $enrollment): void
    {
        $status = $this->getRandomWeighted($this->interviewStatuses);
        $interviewer = User::where('role', 'interviewer')
            ->inRandomOrder()
            ->first();

        $interview = Interview::factory()
            ->state(function (array $attributes) use ($enrollment, $interviewer, $status) {
                return [
                    'enrollment_id' => $enrollment->id,
                    'interviewer_id' => $interviewer->id,
                    'status' => $status
                ];
            });

        switch ($status) {
            case 'completed':
                $interview->completed();
                break;
            case 'cancelled':
                $interview->cancelled();
                break;
            case 'failed':
                $interview->failed();
                break;
            default:
                $interview->scheduled();
        }

        $interview->create();
    }

    /**
     * Get random weighted value from array.
     *
     * @param array<string, float> $weighted
     * @return string
     */
    protected function getRandomWeighted(array $weighted): string
    {
        $rand = mt_rand(1, 100) / 100;
        $total = 0;

        foreach ($weighted as $key => $weight) {
            $total += $weight;
            if ($rand <= $total) {
                return $key;
            }
        }

        return array_key_first($weighted);
    }

    /**
     * Truncate all relevant tables.
     *
     * @return void
     */
    protected function truncateTables(): void
    {
        DB::statement('SET FOREIGN_KEY_CHECKS=0;');
        
        $tables = ['users', 'enrollments', 'interviews', 'documents', 'health_records'];
        foreach ($tables as $table) {
            DB::table($table)->truncate();
        }
        
        DB::statement('SET FOREIGN_KEY_CHECKS=1;');
    }
}