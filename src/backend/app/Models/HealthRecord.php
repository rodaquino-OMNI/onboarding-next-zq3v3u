<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * HealthRecord Model for AUSTA Integration Platform
 *
 * Manages HIPAA-compliant health records with encryption, audit logging,
 * and comprehensive data validation.
 *
 * @property uuid $id
 * @property uuid $enrollment_id
 * @property json $health_data
 * @property boolean $verified
 * @property timestamp $submitted_at
 * @property timestamp $created_at
 * @property timestamp $updated_at
 * @property timestamp $deleted_at
 * @property timestamp $last_encrypted_at
 * @property string $encryption_version
 */
class HealthRecord extends Model
{
    use HasFactory, SoftDeletes;

    /**
     * Required health data fields
     */
    private const HEALTH_DATA_FIELDS = [
        'medical_history',
        'current_medications',
        'allergies',
        'chronic_conditions',
        'family_history',
        'lifestyle_factors',
        'emergency_contacts',
        'primary_physician',
        'insurance_details'
    ];

    /**
     * Required fields that must be present
     */
    private const REQUIRED_FIELDS = [
        'medical_history',
        'current_medications',
        'allergies'
    ];

    /**
     * Fields requiring encryption
     */
    private const SENSITIVE_FIELDS = [
        'medical_history',
        'chronic_conditions',
        'family_history'
    ];

    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'health_records';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<string>
     */
    protected $fillable = [
        'enrollment_id',
        'health_data',
        'verified',
        'submitted_at',
        'last_encrypted_at',
        'encryption_version'
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'health_data' => 'encrypted:json',
        'verified' => 'boolean',
        'submitted_at' => 'datetime',
        'last_encrypted_at' => 'datetime'
    ];

    /**
     * The attributes that should be mutated to dates.
     *
     * @var array<string>
     */
    protected $dates = [
        'submitted_at',
        'created_at',
        'updated_at',
        'deleted_at',
        'last_encrypted_at'
    ];

    /**
     * The attributes that should be hidden for arrays.
     *
     * @var array<string>
     */
    protected $hidden = [
        'encryption_version'
    ];

    /**
     * Create a new HealthRecord instance.
     *
     * @param array $attributes
     * @return void
     */
    public function __construct(array $attributes = [])
    {
        parent::__construct($attributes);

        // Initialize encryption version
        if (!isset($this->encryption_version)) {
            $this->encryption_version = config('app.encryption_version', 'v1');
        }

        // Set up audit logging
        $this->logAuditTrail('created');
    }

    /**
     * Get the enrollment that owns the health record.
     *
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo
     */
    public function enrollment()
    {
        return $this->belongsTo(Enrollment::class)->withTrashed();
    }

    /**
     * Set encrypted health data with validation and sanitization.
     *
     * @param array $data
     * @return bool
     * @throws \InvalidArgumentException
     */
    public function setHealthData(array $data): bool
    {
        // Validate required fields
        $validator = Validator::make($data, [
            'medical_history' => 'required|array',
            'current_medications' => 'required|array',
            'allergies' => 'required|array'
        ]);

        if ($validator->fails()) {
            throw new \InvalidArgumentException('Missing required health data fields');
        }

        // Sanitize and validate data structure
        $sanitizedData = [];
        foreach (self::HEALTH_DATA_FIELDS as $field) {
            if (isset($data[$field])) {
                $sanitizedData[$field] = $this->sanitizeField($data[$field]);
            }
        }

        // Encrypt sensitive fields
        foreach (self::SENSITIVE_FIELDS as $field) {
            if (isset($sanitizedData[$field])) {
                $sanitizedData[$field] = $this->encryptField($sanitizedData[$field]);
            }
        }

        $this->health_data = $sanitizedData;
        $this->last_encrypted_at = now();

        // Log data modification
        $this->logAuditTrail('health_data_updated', [
            'fields_updated' => array_keys($sanitizedData)
        ]);

        return $this->save();
    }

    /**
     * Get decrypted health data with access logging.
     *
     * @return array
     */
    public function getHealthData(): array
    {
        $this->logAuditTrail('health_data_accessed');

        $data = $this->health_data;

        // Decrypt sensitive fields
        foreach (self::SENSITIVE_FIELDS as $field) {
            if (isset($data[$field])) {
                $data[$field] = $this->decryptField($data[$field]);
            }
        }

        return $data;
    }

    /**
     * Mark health record as verified with audit trail.
     *
     * @return bool
     */
    public function markAsVerified(): bool
    {
        $this->verified = true;
        $this->submitted_at = now();

        $this->logAuditTrail('record_verified');

        return $this->save();
    }

    /**
     * Re-encrypt health data with new encryption key.
     *
     * @return bool
     */
    public function reencrypt(): bool
    {
        // Get current data
        $currentData = $this->getHealthData();

        // Update encryption version
        $this->encryption_version = config('app.encryption_version');
        
        // Re-encrypt with new key
        foreach (self::SENSITIVE_FIELDS as $field) {
            if (isset($currentData[$field])) {
                $currentData[$field] = $this->encryptField($currentData[$field]);
            }
        }

        $this->health_data = $currentData;
        $this->last_encrypted_at = now();

        $this->logAuditTrail('data_reencrypted', [
            'new_version' => $this->encryption_version
        ]);

        return $this->save();
    }

    /**
     * Sanitize field data.
     *
     * @param mixed $value
     * @return mixed
     */
    private function sanitizeField($value)
    {
        if (is_array($value)) {
            return array_map([$this, 'sanitizeField'], $value);
        }
        return strip_tags((string) $value);
    }

    /**
     * Encrypt field value.
     *
     * @param mixed $value
     * @return string
     */
    private function encryptField($value): string
    {
        return Crypt::encryptString(
            is_array($value) ? json_encode($value) : (string) $value
        );
    }

    /**
     * Decrypt field value.
     *
     * @param string $value
     * @return mixed
     */
    private function decryptField(string $value)
    {
        $decrypted = Crypt::decryptString($value);
        return json_decode($decrypted, true) ?? $decrypted;
    }

    /**
     * Log audit trail for HIPAA compliance.
     *
     * @param string $action
     * @param array $details
     * @return void
     */
    private function logAuditTrail(string $action, array $details = []): void
    {
        $logData = [
            'health_record_id' => $this->id,
            'enrollment_id' => $this->enrollment_id,
            'action' => $action,
            'details' => $details,
            'user_id' => auth()->id(),
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent()
        ];

        Log::channel('hipaa-audit')->info('Health record activity', $logData);
    }
}