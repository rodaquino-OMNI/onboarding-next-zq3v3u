<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Carbon\Carbon;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;

/**
 * Enrollment Model for AUSTA Integration Platform
 *
 * Manages healthcare enrollment applications with HIPAA compliance,
 * complete workflow support, and security features.
 *
 * @property uuid $id
 * @property uuid $user_id
 * @property string $status
 * @property json $metadata
 * @property json $encrypted_data
 * @property timestamp $completed_at
 * @property timestamp $created_at
 * @property timestamp $updated_at
 * @property timestamp $deleted_at
 */
class Enrollment extends Model
{
    use HasFactory, SoftDeletes;

    /**
     * Valid enrollment statuses
     */
    public const ENROLLMENT_STATUSES = [
        'draft',
        'documents_pending',
        'documents_submitted',
        'health_declaration_pending',
        'interview_scheduled',
        'interview_completed',
        'completed',
        'cancelled'
    ];

    /**
     * Allowed status transitions
     */
    public const STATUS_TRANSITIONS = [
        'draft' => ['documents_pending'],
        'documents_pending' => ['documents_submitted', 'cancelled'],
        'documents_submitted' => ['health_declaration_pending', 'cancelled'],
        'health_declaration_pending' => ['interview_scheduled', 'completed', 'cancelled'],
        'interview_scheduled' => ['interview_completed', 'cancelled'],
        'interview_completed' => ['completed', 'cancelled'],
        'completed' => [],
        'cancelled' => []
    ];

    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'enrollments';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<string>
     */
    protected $fillable = [
        'user_id',
        'status',
        'metadata',
        'encrypted_data'
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'metadata' => 'json',
        'encrypted_data' => 'encrypted:json',
        'completed_at' => 'datetime'
    ];

    /**
     * The attributes that should be mutated to dates.
     *
     * @var array<string>
     */
    protected $dates = [
        'completed_at',
        'created_at',
        'updated_at',
        'deleted_at'
    ];

    /**
     * The relationships that should always be loaded.
     *
     * @var array<string>
     */
    protected $with = ['user'];

    /**
     * The relationship counts that should be eager loaded.
     *
     * @var array<string>
     */
    protected $withCount = ['documents', 'healthRecords'];

    /**
     * Create a new Enrollment instance.
     *
     * @param array $attributes
     * @return void
     */
    public function __construct(array $attributes = [])
    {
        parent::__construct($attributes);
        
        // Set default status for new enrollments
        if (!isset($this->status)) {
            $this->status = 'draft';
        }

        // Initialize encrypted data container
        if (!isset($this->encrypted_data)) {
            $this->encrypted_data = [];
        }

        // Set up audit logging
        $this->logAuditTrail('created');
    }

    /**
     * Get the user that owns the enrollment.
     *
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the documents associated with the enrollment.
     *
     * @return \Illuminate\Database\Eloquent\Relations\HasMany
     */
    public function documents()
    {
        return $this->hasMany('App\Models\Document', 'enrollment_id')
            ->with('metadata');
    }

    /**
     * Get the health records associated with the enrollment.
     *
     * @return \Illuminate\Database\Eloquent\Relations\HasMany
     */
    public function healthRecords()
    {
        return $this->hasMany('App\Models\HealthRecord', 'enrollment_id')
            ->with('data');
    }

    /**
     * Get the interviews associated with the enrollment.
     *
     * @return \Illuminate\Database\Eloquent\Relations\HasMany
     */
    public function interviews()
    {
        return $this->hasMany('App\Models\Interview', 'enrollment_id')
            ->with('schedule');
    }

    /**
     * Update enrollment status with validation and audit logging.
     *
     * @param string $status
     * @return bool
     * @throws \InvalidArgumentException
     */
    public function updateStatus(string $status): bool
    {
        // Validate status
        if (!in_array($status, self::ENROLLMENT_STATUSES)) {
            throw new \InvalidArgumentException('Invalid enrollment status');
        }

        // Verify status transition is allowed
        if (!in_array($status, self::STATUS_TRANSITIONS[$this->status])) {
            throw new \InvalidArgumentException('Invalid status transition');
        }

        $oldStatus = $this->status;
        $this->status = $status;

        // Set completion timestamp if status is completed
        if ($status === 'completed') {
            $this->completed_at = Carbon::now();
        }

        // Log status change
        $this->logAuditTrail('status_updated', [
            'old_status' => $oldStatus,
            'new_status' => $status
        ]);

        // Save changes
        $saved = $this->save();

        // Clear related caches
        if ($saved) {
            cache()->tags(['enrollments'])->forget("enrollment:{$this->id}");
        }

        return $saved;
    }

    /**
     * Check if enrollment is complete.
     *
     * @return bool
     */
    public function isComplete(): bool
    {
        if ($this->status !== 'completed') {
            return false;
        }

        if (!$this->completed_at) {
            return false;
        }

        // Verify all required documents are processed
        $requiredDocuments = $this->documents()
            ->where('status', 'processed')
            ->count();

        if ($requiredDocuments < config('enrollment.required_documents_count')) {
            return false;
        }

        // Verify health records are complete
        $healthRecordsComplete = $this->healthRecords()
            ->where('status', 'verified')
            ->exists();

        return $healthRecordsComplete;
    }

    /**
     * Check if enrollment requires medical interview.
     *
     * @return bool
     */
    public function requiresInterview(): bool
    {
        // Check cache first
        $cacheKey = "enrollment:{$this->id}:requires_interview";
        if (cache()->has($cacheKey)) {
            return cache()->get($cacheKey);
        }

        $requiresInterview = false;

        // Check health declaration responses
        if (isset($this->metadata['health_declaration'])) {
            $riskFactors = array_filter($this->metadata['health_declaration'], function($response) {
                return $response === true;
            });

            if (count($riskFactors) > 0) {
                $requiresInterview = true;
            }
        }

        // Check age factor
        if (isset($this->metadata['age']) && $this->metadata['age'] > 60) {
            $requiresInterview = true;
        }

        // Cache result for 24 hours
        cache()->put($cacheKey, $requiresInterview, Carbon::now()->addHours(24));

        return $requiresInterview;
    }

    /**
     * Encrypt sensitive enrollment data fields.
     *
     * @param array $data
     * @return void
     */
    public function encryptSensitiveData(array $data): void
    {
        $sensitiveFields = [
            'ssn',
            'medical_history',
            'family_history',
            'current_medications'
        ];

        $encryptedData = [];

        foreach ($sensitiveFields as $field) {
            if (isset($data[$field])) {
                $encryptedData[$field] = Crypt::encryptString($data[$field]);
            }
        }

        $this->encrypted_data = $encryptedData;
        
        $this->logAuditTrail('data_encrypted', [
            'fields' => array_keys($encryptedData)
        ]);

        $this->save();
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
        $logData = [
            'enrollment_id' => $this->id,
            'user_id' => $this->user_id,
            'action' => $action,
            'details' => $details,
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent()
        ];

        Log::channel('audit')->info('Enrollment activity', $logData);
    }
}