<?php

namespace Database\Factories;

use App\Models\Document;
use App\Models\Enrollment;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * Factory for generating HIPAA-compliant test Document instances
 * with realistic OCR data and secure storage paths.
 */
class DocumentFactory extends Factory
{
    /**
     * The name of the factory's corresponding model.
     *
     * @var string
     */
    protected $model = Document::class;

    /**
     * Define the model's default state with HIPAA-compliant test data.
     *
     * @return array<string, mixed>
     */
    public function definition()
    {
        // Generate secure S3 storage path with encryption prefix
        $storagePath = sprintf(
            'documents/%s/%s/%s.pdf',
            date('Y/m'),
            Str::uuid(),
            Str::random(40)
        );

        // Create realistic OCR data with confidence scores
        $ocrData = [
            'confidence' => $this->faker->randomFloat(2, 0.85, 0.99),
            'data' => [
                'text_blocks' => $this->generateTextBlocks(),
                'metadata' => [
                    'processing_time' => $this->faker->numberBetween(1000, 5000),
                    'page_count' => $this->faker->numberBetween(1, 10),
                    'dpi' => $this->faker->randomElement([200, 300, 600])
                ]
            ],
            'security' => [
                'encryption_version' => 'AES-256-GCM',
                'checksum' => Str::random(64),
                'processed_by' => 'AWS-Textract-' . $this->faker->semver()
            ]
        ];

        // Generate audit trail with HIPAA compliance data
        $auditTrail = [
            'created_at' => now(),
            'created_by' => $this->faker->uuid(),
            'access_history' => [],
            'processing_history' => [
                [
                    'timestamp' => now(),
                    'action' => 'upload',
                    'status' => 'completed',
                    'details' => [
                        'source_ip' => $this->faker->ipv4(),
                        'user_agent' => $this->faker->userAgent(),
                        'file_size' => $this->faker->numberBetween(100000, 5000000)
                    ]
                ]
            ]
        ];

        return [
            'enrollment_id' => Enrollment::factory(),
            'type' => $this->faker->randomElement(Document::DOCUMENT_TYPES),
            'storage_path' => $storagePath,
            'ocr_data' => $ocrData,
            'audit_trail' => $auditTrail,
            'processed_at' => now(),
            'last_accessed_at' => now()
        ];
    }

    /**
     * Generate document state before OCR processing.
     *
     * @return self
     */
    public function unprocessed()
    {
        return $this->state(function (array $attributes) {
            return [
                'ocr_data' => null,
                'processed_at' => null,
                'audit_trail' => [
                    'created_at' => now(),
                    'created_by' => $this->faker->uuid(),
                    'access_history' => [],
                    'processing_history' => [
                        [
                            'timestamp' => now(),
                            'action' => 'upload',
                            'status' => 'pending',
                            'details' => [
                                'source_ip' => $this->faker->ipv4(),
                                'user_agent' => $this->faker->userAgent(),
                                'file_size' => $this->faker->numberBetween(100000, 5000000)
                            ]
                        ]
                    ]
                ]
            ];
        });
    }

    /**
     * Set specific document type with type-specific security rules.
     *
     * @param string $type
     * @return self
     */
    public function withType(string $type)
    {
        if (!in_array($type, Document::DOCUMENT_TYPES)) {
            throw new \InvalidArgumentException('Invalid document type specified');
        }

        return $this->state(function (array $attributes) use ($type) {
            return [
                'type' => $type,
                'audit_trail' => array_merge($attributes['audit_trail'] ?? [], [
                    'type_validation' => [
                        'timestamp' => now(),
                        'type' => $type,
                        'validation_status' => 'passed'
                    ]
                ])
            ];
        });
    }

    /**
     * Generate realistic text blocks for OCR data.
     *
     * @return array
     */
    private function generateTextBlocks()
    {
        $blocks = [];
        $blockCount = $this->faker->numberBetween(5, 15);

        for ($i = 0; $i < $blockCount; $i++) {
            $blocks[] = [
                'id' => Str::uuid(),
                'text' => $this->faker->paragraph(),
                'confidence' => $this->faker->randomFloat(2, 0.85, 0.99),
                'boundingBox' => [
                    'left' => $this->faker->randomFloat(2, 0, 800),
                    'top' => $this->faker->randomFloat(2, 0, 1000),
                    'width' => $this->faker->randomFloat(2, 50, 500),
                    'height' => $this->faker->randomFloat(2, 20, 100)
                ],
                'type' => $this->faker->randomElement(['text', 'key_value', 'table', 'signature']),
                'page' => $this->faker->numberBetween(1, 5)
            ];
        }

        return $blocks;
    }
}