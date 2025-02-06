<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Crypt;

/**
 * Document Model for AUSTA Integration Platform
 *
 * Manages healthcare enrollment documents with enhanced security,
 * HIPAA compliance, and OCR processing capabilities.
 *
 * @property uuid $id
 * @property uuid $enrollment_id
 * @property string $type
 * @property string $storage_path
 * @property json $ocr_data
 * @property json $audit_trail
 * @property timestamp $processed_at
 * @property timestamp $last_accessed_at
 * @property timestamp $created_at
 * @property timestamp $updated_at
 * @property timestamp $deleted_at
 */
class Document extends Model
{
    use HasFactory, SoftDeletes;

    /**
     * Valid document types for healthcare enrollment
     */
    public const DOCUMENT_TYPES = [
        'id_document',
        'proof_of_address',
        'health_declaration',
        'medical_record'
    ];

    /**
     * Storage configuration for document files
     */
    private const STORAGE_DISK = 's3';
    private const MAX_URL_EXPIRY = 30; // minutes
    private const REQUIRED_OCR_CONFIDENCE = 0.85;

    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'documents';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<string>
     */
    protected $fillable = [
        'enrollment_id',
        'type',
        'storage_path',
        'ocr_data',
        'audit_trail'
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'ocr_data' => 'encrypted:json',
        'audit_trail' => 'encrypted:json',
        'processed_at' => 'datetime',
        'last_accessed_at' => 'datetime'
    ];

    /**
     * The attributes that should be mutated to dates.
     *
     * @var array<string>
     */
    protected $dates = [
        'processed_at',
        'last_accessed_at',
        'created_at',
        'updated_at',
        'deleted_at'
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var array<string>
     */
    protected $hidden = [
        'storage_path',
        'audit_trail'
    ];

    /**
     * Create a new Document instance with security initialization.
     *
     * @param array $attributes
     * @return void
     */
    public function __construct(array $attributes = [])
    {
        parent::__construct($attributes);

        // Initialize audit trail
        if (!isset($this->audit_trail)) {
            $this->audit_trail = [
                'created_at' => now(),
                'created_by' => auth()->id(),
                'access_history' => [],
                'processing_history' => []
            ];
        }

        // Validate document type if set
        if (isset($this->type)) {
            $this->validateDocumentType($this->type);
        }

        // Log document creation
        Log::channel('audit')->info('Document created', [
            'document_id' => $this->id,
            'enrollment_id' => $this->enrollment_id,
            'type' => $this->type,
            'created_by' => auth()->id()
        ]);
    }

    /**
     * Get the enrollment that owns the document.
     *
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo
     */
    public function enrollment()
    {
        return $this->belongsTo(Enrollment::class);
    }

    /**
     * Check if document has been processed by OCR with required confidence.
     *
     * @return bool
     */
    public function isProcessed(): bool
    {
        if (!$this->processed_at || !$this->ocr_data) {
            return false;
        }

        $ocrData = json_decode($this->ocr_data, true);
        $confidence = $ocrData['confidence'] ?? 0;

        $isProcessed = $confidence >= self::REQUIRED_OCR_CONFIDENCE;

        // Log validation check
        $this->logAuditTrail('process_validation', [
            'confidence' => $confidence,
            'threshold' => self::REQUIRED_OCR_CONFIDENCE,
            'result' => $isProcessed
        ]);

        return $isProcessed;
    }

    /**
     * Generate secure temporary URL for document access.
     *
     * @param int $expiryMinutes
     * @param string $accessReason
     * @return string
     * @throws \InvalidArgumentException
     */
    public function getStorageUrl(int $expiryMinutes = 5, string $accessReason = ''): string
    {
        // Validate expiry time
        if ($expiryMinutes > self::MAX_URL_EXPIRY) {
            throw new \InvalidArgumentException('Requested URL expiry exceeds maximum allowed time');
        }

        // Verify file exists
        if (!Storage::disk(self::STORAGE_DISK)->exists($this->storage_path)) {
            throw new \InvalidArgumentException('Document file not found in storage');
        }

        // Generate temporary URL with security headers
        $url = Storage::disk(self::STORAGE_DISK)->temporaryUrl(
            $this->storage_path,
            now()->addMinutes($expiryMinutes),
            [
                'ResponseContentDisposition' => 'attachment',
                'ResponseContentType' => 'application/octet-stream'
            ]
        );

        // Log access attempt
        $this->logAuditTrail('url_generated', [
            'expiry_minutes' => $expiryMinutes,
            'access_reason' => $accessReason,
            'ip_address' => request()->ip()
        ]);

        // Update last accessed timestamp
        $this->last_accessed_at = now();
        $this->save();

        return $url;
    }

    /**
     * Mark document as processed after OCR completion.
     *
     * @param array $ocrResults
     * @return bool
     * @throws \InvalidArgumentException
     */
    public function markAsProcessed(array $ocrResults): bool
    {
        // Validate OCR results structure
        if (!isset($ocrResults['confidence']) || !isset($ocrResults['data'])) {
            throw new \InvalidArgumentException('Invalid OCR results structure');
        }

        // Verify confidence meets threshold
        if ($ocrResults['confidence'] < self::REQUIRED_OCR_CONFIDENCE) {
            throw new \InvalidArgumentException('OCR confidence below required threshold');
        }

        // Encrypt sensitive OCR data
        $encryptedData = Crypt::encrypt($ocrResults);

        // Update document with OCR results
        $this->ocr_data = $encryptedData;
        $this->processed_at = now();

        // Log processing details
        $this->logAuditTrail('ocr_processed', [
            'confidence' => $ocrResults['confidence'],
            'processed_at' => $this->processed_at
        ]);

        return $this->save();
    }

    /**
     * Validate document type against allowed types.
     *
     * @param string $type
     * @return bool
     * @throws \InvalidArgumentException
     */
    public function validateDocumentType(string $type): bool
    {
        if (!in_array($type, self::DOCUMENT_TYPES)) {
            throw new \InvalidArgumentException('Invalid document type');
        }

        // Log validation
        $this->logAuditTrail('type_validation', [
            'type' => $type,
            'valid' => true
        ]);

        return true;
    }

    /**
     * Log audit trail for HIPAA compliance.
     *
     * @param string $action
     * @param array $details
     * @return void
     */
    protected function logAuditTrail(string $action, array $details = []): void
    {
        $auditEntry = [
            'timestamp' => now(),
            'action' => $action,
            'user_id' => auth()->id(),
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
            'details' => $details
        ];

        $auditTrail = $this->audit_trail ?? [];
        $auditTrail['access_history'][] = $auditEntry;

        $this->audit_trail = $auditTrail;
        $this->save();

        // Log to audit channel
        Log::channel('audit')->info('Document activity', [
            'document_id' => $this->id,
            'enrollment_id' => $this->enrollment_id,
            'action' => $action,
            'details' => $details
        ]);
    }
}