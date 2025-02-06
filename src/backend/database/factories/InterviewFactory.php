<?php

namespace Database\Factories;

use App\Models\Interview;
use App\Models\User;
use App\Models\Enrollment;
use Illuminate\Database\Eloquent\Factories\Factory;
use Carbon\Carbon;

/**
 * Factory for generating HIPAA-compliant test interview data
 * with enhanced relationship validation and state management.
 */
class InterviewFactory extends Factory
{
    /**
     * The name of the factory's corresponding model.
     *
     * @var string
     */
    protected $model = Interview::class;

    /**
     * Valid interview statuses.
     *
     * @var array
     */
    protected $statuses = [
        'scheduled',
        'in_progress',
        'completed',
        'cancelled',
        'rescheduled',
        'failed'
    ];

    /**
     * Supported video providers.
     *
     * @var array
     */
    protected $providers = ['vonage'];

    /**
     * Define the model's default state.
     *
     * @return array
     */
    public function definition()
    {
        // Get random enrollment that's in a valid state for interviews
        $enrollment = Enrollment::where('status', 'health_declaration_pending')
            ->inRandomOrder()
            ->first();

        // Get random interviewer user
        $interviewer = User::where('role', 'interviewer')
            ->inRandomOrder()
            ->first();

        // Generate future datetime within business hours (9 AM - 5 PM)
        $scheduledAt = Carbon::instance($this->faker->dateTimeBetween('+1 day', '+2 weeks'))
            ->setHour($this->faker->numberBetween(9, 16))
            ->setMinute(0)
            ->setSecond(0);

        return [
            'enrollment_id' => $enrollment->id,
            'interviewer_id' => $interviewer->id,
            'status' => 'scheduled',
            'scheduled_at' => $scheduledAt,
            'video_provider' => 'vonage',
            'video_session_id' => $this->faker->uuid,
            'encrypted_notes' => null,
            'audit_trail' => [
                [
                    'action' => 'created',
                    'timestamp' => now(),
                    'details' => [
                        'created_by' => 'factory'
                    ]
                ]
            ]
        ];
    }

    /**
     * Indicate that the interview is scheduled.
     *
     * @return \Illuminate\Database\Eloquent\Factories\Factory
     */
    public function scheduled()
    {
        return $this->state(function (array $attributes) {
            return [
                'status' => 'scheduled',
                'scheduled_at' => Carbon::instance($this->faker->dateTimeBetween('+1 day', '+2 weeks'))
                    ->setHour($this->faker->numberBetween(9, 16))
                    ->setMinute(0)
                    ->setSecond(0),
                'encrypted_notes' => null
            ];
        });
    }

    /**
     * Indicate that the interview is completed.
     *
     * @return \Illuminate\Database\Eloquent\Factories\Factory
     */
    public function completed()
    {
        return $this->state(function (array $attributes) {
            $completedAt = Carbon::instance($this->faker->dateTimeBetween('-1 month', '-1 day'));
            
            return [
                'status' => 'completed',
                'scheduled_at' => $completedAt,
                'encrypted_notes' => json_encode([
                    'medical_history' => $this->faker->text(200),
                    'current_medications' => $this->faker->words(5),
                    'allergies' => $this->faker->words(3),
                    'recommendations' => $this->faker->text(100),
                    'next_steps' => $this->faker->text(50)
                ]),
                'audit_trail' => array_merge($attributes['audit_trail'] ?? [], [
                    [
                        'action' => 'completed',
                        'timestamp' => $completedAt,
                        'details' => [
                            'duration' => $this->faker->numberBetween(15, 45),
                            'completed_by' => 'interviewer'
                        ]
                    ]
                ])
            ];
        });
    }

    /**
     * Indicate that the interview is cancelled.
     *
     * @return \Illuminate\Database\Eloquent\Factories\Factory
     */
    public function cancelled()
    {
        return $this->state(function (array $attributes) {
            $cancelledAt = Carbon::instance($this->faker->dateTimeBetween('-1 week', 'now'));
            
            return [
                'status' => 'cancelled',
                'scheduled_at' => $cancelledAt,
                'encrypted_notes' => json_encode([
                    'cancellation_reason' => $this->faker->randomElement([
                        'patient_request',
                        'interviewer_unavailable',
                        'technical_issues',
                        'rescheduled'
                    ]),
                    'additional_notes' => $this->faker->sentence
                ]),
                'audit_trail' => array_merge($attributes['audit_trail'] ?? [], [
                    [
                        'action' => 'cancelled',
                        'timestamp' => $cancelledAt,
                        'details' => [
                            'cancelled_by' => $this->faker->randomElement(['patient', 'interviewer', 'system'])
                        ]
                    ]
                ])
            ];
        });
    }

    /**
     * Indicate that the interview is in progress.
     *
     * @return \Illuminate\Database\Eloquent\Factories\Factory
     */
    public function inProgress()
    {
        return $this->state(function (array $attributes) {
            return [
                'status' => 'in_progress',
                'scheduled_at' => now(),
                'encrypted_notes' => null,
                'audit_trail' => array_merge($attributes['audit_trail'] ?? [], [
                    [
                        'action' => 'started',
                        'timestamp' => now(),
                        'details' => [
                            'started_by' => 'interviewer'
                        ]
                    ]
                ])
            ];
        });
    }

    /**
     * Indicate that the interview has failed.
     *
     * @return \Illuminate\Database\Eloquent\Factories\Factory
     */
    public function failed()
    {
        return $this->state(function (array $attributes) {
            $failedAt = Carbon::instance($this->faker->dateTimeBetween('-1 week', 'now'));
            
            return [
                'status' => 'failed',
                'scheduled_at' => $failedAt,
                'encrypted_notes' => json_encode([
                    'failure_reason' => $this->faker->randomElement([
                        'connection_lost',
                        'video_quality_issues',
                        'audio_problems',
                        'system_error'
                    ]),
                    'error_details' => $this->faker->sentence
                ]),
                'audit_trail' => array_merge($attributes['audit_trail'] ?? [], [
                    [
                        'action' => 'failed',
                        'timestamp' => $failedAt,
                        'details' => [
                            'error_code' => $this->faker->randomElement(['ERR_001', 'ERR_002', 'ERR_003']),
                            'system_status' => $this->faker->randomElement(['degraded', 'error', 'offline'])
                        ]
                    ]
                ])
            ];
        });
    }
}