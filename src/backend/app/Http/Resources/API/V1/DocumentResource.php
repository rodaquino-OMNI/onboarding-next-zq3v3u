<?php

namespace App\Http\Resources\API\V1;

use Illuminate\Http\Resources\Json\JsonResource;
use Carbon\Carbon;
use App\Models\Document;
use Illuminate\Support\Facades\Log;

/**
 * API Resource for transforming Document models into HIPAA-compliant JSON responses
 * 
 * @extends JsonResource
 */
class DocumentResource extends JsonResource
{
    /**
     * Preserve collection keys
     *
     * @var bool
     */
    public $preserveKeys = false;

    /**
     * URL expiry time in minutes for secure document access
     *
     * @var int
     */
    private const URL_EXPIRY_MINUTES = 15;

    /**
     * Fields containing PHI that require masking
     *
     * @var array
     */
    private const PHI_FIELDS = [
        'medical_notes',
        'diagnosis_codes',
        'health_data'
    ];

    /**
     * Transform the Document model into a HIPAA-compliant array.
     *
     * @param \Illuminate\Http\Request $request
     * @return array
     */
    public function toArray($request): array
    {
        // Log document access for HIPAA audit trail
        Log::channel('audit')->info('Document resource accessed', [
            'document_id' => $this->id,
            'user_id' => auth()->id(),
            'ip_address' => $request->ip()
        ]);

        return [
            'id' => $this->id,
            'type' => 'document',
            'attributes' => [
                'enrollment_id' => $this->enrollment_id,
                'document_type' => $this->type,
                'status' => $this->isProcessed() ? 'processed' : 'pending',
                'ocr_confidence' => $this->when($this->isProcessed(), function() {
                    $ocrData = json_decode($this->ocr_data, true);
                    return $ocrData['confidence'] ?? 0;
                }),
                'secure_url' => $this->when($this->storage_path, function() {
                    return $this->getStorageUrl(self::URL_EXPIRY_MINUTES, 'api_access');
                }),
                'processed_data' => $this->when($this->ocr_data, function() {
                    return $this->maskPhiData(json_decode($this->ocr_data, true));
                }),
            ],
            'meta' => [
                'created_at' => Carbon::parse($this->created_at)->toIso8601String(),
                'updated_at' => Carbon::parse($this->updated_at)->toIso8601String(),
                'processed_at' => $this->when($this->processed_at, function() {
                    return Carbon::parse($this->processed_at)->toIso8601String();
                }),
                'last_accessed_at' => $this->when($this->last_accessed_at, function() {
                    return Carbon::parse($this->last_accessed_at)->toIso8601String();
                }),
                'url_expiry' => Carbon::now()->addMinutes(self::URL_EXPIRY_MINUTES)->toIso8601String(),
            ],
            'relationships' => [
                'enrollment' => [
                    'id' => $this->enrollment_id,
                    'type' => 'enrollment'
                ]
            ]
        ];
    }

    /**
     * Apply HIPAA-compliant masking to sensitive PHI fields.
     *
     * @param array $data
     * @return array
     */
    private function maskPhiData(array $data): array
    {
        foreach (self::PHI_FIELDS as $field) {
            if (isset($data[$field])) {
                if (is_string($data[$field])) {
                    // Mask all but last 4 characters for string values
                    $length = strlen($data[$field]);
                    $data[$field] = str_repeat('*', max(0, $length - 4)) . 
                        substr($data[$field], -4);
                } elseif (is_array($data[$field])) {
                    // Recursively mask nested PHI data
                    $data[$field] = $this->maskPhiData($data[$field]);
                }
            }
        }

        return $data;
    }
}