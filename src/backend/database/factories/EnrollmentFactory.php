<?php

namespace Database\Factories;

use App\Models\Enrollment;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;

/**
 * Factory for generating HIPAA-compliant test enrollment records
 * with multi-language support and realistic data patterns.
 *
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Enrollment>
 */
class EnrollmentFactory extends Factory
{
    /**
     * The name of the factory's corresponding model.
     *
     * @var string
     */
    protected $model = Enrollment::class;

    /**
     * Fields requiring encryption for HIPAA compliance.
     *
     * @var array<string>
     */
    protected $encryptedFields = [
        'ssn',
        'medical_history',
        'family_history',
        'current_medications'
    ];

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition()
    {
        // Get random user ID from existing users
        $userId = User::inRandomOrder()->first()->id;

        return [
            'id' => Str::uuid(),
            'user_id' => $userId,
            'status' => 'draft',
            'metadata' => [
                'locale' => 'pt-BR',
                'age' => $this->faker->numberBetween(18, 80),
                'health_declaration' => [
                    'has_chronic_conditions' => $this->faker->boolean(30),
                    'has_allergies' => $this->faker->boolean(20),
                    'takes_medication' => $this->faker->boolean(40),
                    'has_surgery_history' => $this->faker->boolean(25)
                ],
                'audit_trail' => [
                    [
                        'action' => 'created',
                        'timestamp' => Carbon::now()->toIso8601String(),
                        'ip_address' => $this->faker->ipv4,
                        'user_agent' => $this->faker->userAgent
                    ]
                ]
            ],
            'encrypted_data' => [],
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now()
        ];
    }

    /**
     * Add encrypted PHI (Protected Health Information) to the enrollment.
     *
     * @return static
     */
    public function withEncryptedData()
    {
        return $this->state(function (array $attributes) {
            $sensitiveData = [
                'ssn' => $this->faker->numerify('###-##-####'),
                'medical_history' => json_encode([
                    'conditions' => $this->faker->randomElements(['Hypertension', 'Diabetes', 'Asthma', 'Arthritis'], 2),
                    'surgeries' => $this->faker->randomElements(['Appendectomy', 'Tonsillectomy'], 1),
                    'allergies' => $this->faker->randomElements(['Penicillin', 'Pollen', 'Latex'], 2)
                ]),
                'family_history' => json_encode([
                    'heart_disease' => $this->faker->boolean(30),
                    'cancer' => $this->faker->boolean(20),
                    'diabetes' => $this->faker->boolean(40)
                ]),
                'current_medications' => json_encode([
                    [
                        'name' => $this->faker->randomElement(['Lisinopril', 'Metformin', 'Omeprazole']),
                        'dosage' => $this->faker->randomElement(['10mg', '20mg', '40mg']),
                        'frequency' => $this->faker->randomElement(['daily', 'twice daily', 'as needed'])
                    ]
                ])
            ];

            $encryptedData = [];
            foreach ($this->encryptedFields as $field) {
                if (isset($sensitiveData[$field])) {
                    $encryptedData[$field] = Crypt::encryptString($sensitiveData[$field]);
                }
            }

            $attributes['encrypted_data'] = $encryptedData;
            $attributes['metadata']['audit_trail'][] = [
                'action' => 'data_encrypted',
                'timestamp' => Carbon::now()->toIso8601String(),
                'fields' => array_keys($encryptedData)
            ];

            return $attributes;
        });
    }

    /**
     * Set specific locale for enrollment content.
     *
     * @param string $locale
     * @return static
     * @throws \InvalidArgumentException
     */
    public function withLocale(string $locale)
    {
        if (!in_array($locale, ['en', 'pt-BR'])) {
            throw new \InvalidArgumentException('Unsupported locale specified');
        }

        return $this->state(function (array $attributes) use ($locale) {
            $attributes['metadata']['locale'] = $locale;
            $attributes['metadata']['audit_trail'][] = [
                'action' => 'locale_set',
                'timestamp' => Carbon::now()->toIso8601String(),
                'locale' => $locale
            ];

            return $attributes;
        });
    }

    /**
     * Generate comprehensive audit trail for the enrollment.
     *
     * @return static
     */
    public function withAuditTrail()
    {
        return $this->state(function (array $attributes) {
            $auditTrail = [
                [
                    'action' => 'created',
                    'timestamp' => Carbon::now()->subDays(5)->toIso8601String(),
                    'ip_address' => $this->faker->ipv4,
                    'user_agent' => $this->faker->userAgent
                ],
                [
                    'action' => 'documents_uploaded',
                    'timestamp' => Carbon::now()->subDays(4)->toIso8601String(),
                    'ip_address' => $this->faker->ipv4,
                    'user_agent' => $this->faker->userAgent,
                    'document_count' => 3
                ],
                [
                    'action' => 'health_declaration_submitted',
                    'timestamp' => Carbon::now()->subDays(3)->toIso8601String(),
                    'ip_address' => $this->faker->ipv4,
                    'user_agent' => $this->faker->userAgent
                ],
                [
                    'action' => 'interview_scheduled',
                    'timestamp' => Carbon::now()->subDays(2)->toIso8601String(),
                    'ip_address' => $this->faker->ipv4,
                    'user_agent' => $this->faker->userAgent,
                    'interview_date' => Carbon::now()->addDays(5)->toIso8601String()
                ]
            ];

            $attributes['metadata']['audit_trail'] = $auditTrail;
            return $attributes;
        });
    }
}