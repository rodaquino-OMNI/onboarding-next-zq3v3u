<?php

namespace Database\Factories;

use App\Models\HealthRecord;
use App\Models\Enrollment;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;
use Carbon\Carbon;

/**
 * Factory for generating HIPAA-compliant test HealthRecord instances
 * 
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\HealthRecord>
 */
class HealthRecordFactory extends Factory
{
    /**
     * The name of the factory's corresponding model.
     *
     * @var string
     */
    protected $model = HealthRecord::class;

    /**
     * Predefined medical conditions for realistic test data
     *
     * @var array
     */
    protected $medicalConditions = [
        'Hypertension',
        'Type 2 Diabetes',
        'Asthma',
        'Hypothyroidism',
        'Rheumatoid Arthritis',
        'Migraine',
        'Anxiety Disorder',
        'Depression',
        'GERD',
        'Osteoarthritis'
    ];

    /**
     * Predefined medications with dosages
     *
     * @var array
     */
    protected $medications = [
        ['name' => 'Lisinopril', 'dosage' => '10mg', 'frequency' => 'daily'],
        ['name' => 'Metformin', 'dosage' => '500mg', 'frequency' => 'twice daily'],
        ['name' => 'Levothyroxine', 'dosage' => '50mcg', 'frequency' => 'daily'],
        ['name' => 'Omeprazole', 'dosage' => '20mg', 'frequency' => 'daily'],
        ['name' => 'Sertraline', 'dosage' => '50mg', 'frequency' => 'daily'],
        ['name' => 'Albuterol', 'dosage' => '90mcg', 'frequency' => 'as needed'],
        ['name' => 'Ibuprofen', 'dosage' => '400mg', 'frequency' => 'as needed']
    ];

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition()
    {
        // Generate a valid enrollment relationship
        $enrollment = Enrollment::factory()->create();

        // Generate comprehensive health data structure
        $healthData = [
            'medical_history' => [
                'conditions' => $this->faker->randomElements($this->medicalConditions, rand(0, 3)),
                'surgeries' => $this->faker->boolean(30) ? [
                    [
                        'procedure' => $this->faker->randomElement(['Appendectomy', 'Tonsillectomy', 'Cholecystectomy']),
                        'year' => $this->faker->numberBetween(1990, 2023)
                    ]
                ] : [],
                'hospitalizations' => $this->faker->boolean(20) ? [
                    [
                        'reason' => $this->faker->sentence(),
                        'date' => $this->faker->date(),
                        'duration' => $this->faker->numberBetween(1, 10) . ' days'
                    ]
                ] : []
            ],
            'current_medications' => $this->faker->randomElements($this->medications, rand(0, 3)),
            'allergies' => $this->faker->boolean(40) ? [
                [
                    'allergen' => $this->faker->randomElement(['Penicillin', 'Sulfa', 'Latex', 'Peanuts']),
                    'reaction' => $this->faker->randomElement(['Rash', 'Hives', 'Anaphylaxis']),
                    'severity' => $this->faker->randomElement(['Mild', 'Moderate', 'Severe'])
                ]
            ] : [],
            'chronic_conditions' => $this->faker->boolean(30) ? 
                $this->faker->randomElements($this->medicalConditions, rand(1, 2)) : [],
            'family_history' => [
                'father' => $this->faker->randomElements($this->medicalConditions, rand(0, 2)),
                'mother' => $this->faker->randomElements($this->medicalConditions, rand(0, 2))
            ],
            'lifestyle_factors' => [
                'smoking' => $this->faker->boolean(20) ? 'Former smoker' : 'Never smoked',
                'alcohol' => $this->faker->randomElement(['None', 'Occasional', 'Moderate']),
                'exercise' => $this->faker->randomElement(['Sedentary', 'Light', 'Moderate', 'Active'])
            ],
            'emergency_contacts' => [
                [
                    'name' => $this->faker->name(),
                    'relationship' => $this->faker->randomElement(['Spouse', 'Parent', 'Sibling']),
                    'phone' => $this->faker->phoneNumber()
                ]
            ],
            'primary_physician' => [
                'name' => 'Dr. ' . $this->faker->name(),
                'specialty' => $this->faker->randomElement(['Family Medicine', 'Internal Medicine']),
                'phone' => $this->faker->phoneNumber()
            ],
            'insurance_details' => [
                'provider' => $this->faker->company(),
                'policy_number' => $this->faker->numerify('########'),
                'group_number' => $this->faker->numerify('#####')
            ]
        ];

        return [
            'enrollment_id' => $enrollment->id,
            'health_data' => $healthData,
            'verified' => false,
            'submitted_at' => null,
            'last_encrypted_at' => Carbon::now(),
            'encryption_version' => config('app.encryption_version', 'v1')
        ];
    }

    /**
     * Indicate that the health record is verified.
     *
     * @return \Illuminate\Database\Eloquent\Factories\Factory
     */
    public function verified()
    {
        return $this->state(function (array $attributes) {
            return [
                'verified' => true,
                'submitted_at' => Carbon::now(),
                'health_data' => array_merge($attributes['health_data'], [
                    'verification' => [
                        'verified_at' => Carbon::now()->toISOString(),
                        'verified_by' => 'Dr. ' . $this->faker->name(),
                        'verification_notes' => $this->faker->sentence()
                    ]
                ])
            ];
        });
    }

    /**
     * Set custom health data with validation.
     *
     * @param array $healthData
     * @return \Illuminate\Database\Eloquent\Factories\Factory
     */
    public function withCustomHealthData(array $healthData)
    {
        return $this->state(function (array $attributes) use ($healthData) {
            // Validate required fields
            $requiredFields = ['medical_history', 'current_medications', 'allergies'];
            foreach ($requiredFields as $field) {
                if (!isset($healthData[$field])) {
                    throw new \InvalidArgumentException("Missing required field: {$field}");
                }
            }

            // Merge with default structure to ensure completeness
            return [
                'health_data' => array_merge($attributes['health_data'], $healthData),
                'last_encrypted_at' => Carbon::now()
            ];
        });
    }
}