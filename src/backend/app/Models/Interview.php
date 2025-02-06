<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Carbon\Carbon;
use Illuminate\Support\Facades\Crypt;
use Laravel\AuditLog\Auditable;

/**
 * Interview Model for AUSTA Integration Platform
 *
 * Manages HIPAA-compliant medical interview sessions with secure video
 * conferencing integration and comprehensive audit logging.
 *
 * @property uuid $id
 * @property uuid $enrollment_id
 * @property uuid $interviewer_id
 * @property string $status
 * @property datetime $scheduled_at
 * @property string $video_provider
 * @property string $video_session_id
 * @property json $encrypted_notes
 * @property json $audit_trail
 * @property timestamp $created_at
 * @property timestamp $updated_at
 * @property timestamp $deleted_at
 */
class Interview extends Model
{
    use HasFactory, SoftDeletes, Auditable;

    /**
     * Valid interview statuses
     */
    protected const INTERVIEW_STATUSES = [
        'scheduled',
        'in_progress',
        'completed',
        'cancelled',
        'rescheduled',
        'failed'
    ];

    /**
     * Supported video providers
     */
    protected const VIDEO_PROVIDERS = ['vonage'];

    /**
     * Fields requiring encryption
     */
    protected const ENCRYPTION_FIELDS = ['notes', 'medical_data'];

    /**
     * The table associated with the model.
     *
     * @var string
     */
    protected $table = 'interviews';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<string>
     */
    protected $fillable = [
        'enrollment_id',
        'interviewer_id',
        'status',
        'scheduled_at',
        'video_provider',
        'video_session_id',
        'encrypted_notes'
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'scheduled_at' => 'datetime',
        'encrypted_notes' => 'encrypted:json',
        'audit_trail' => 'json'
    ];

    /**
     * The attributes that should be mutated to dates.
     *
     * @var array<string>
     */
    protected $dates = [
        'scheduled_at',
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
        'video_session_id',
        'audit_trail'
    ];

    /**
     * Create a new Interview instance.
     *
     * @param array $attributes
     * @return void
     */
    public function __construct(array $attributes = [])
    {
        parent::__construct($attributes);

        // Set default status for new interviews
        if (!isset($this->status)) {
            $this->status = 'scheduled';
        }

        // Set default video provider
        if (!isset($this->video_provider)) {
            $this->video_provider = 'vonage';
        }

        // Initialize audit trail
        if (!isset($this->audit_trail)) {
            $this->audit_trail = [];
        }

        // Set up audit logging
        $this->logAuditTrail('created');
    }

    /**
     * Get the enrollment that owns the interview.
     *
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo
     */
    public function enrollment()
    {
        return $this->belongsTo(Enrollment::class)
            ->withTrashed();
    }

    /**
     * Get the interviewer (user) conducting the interview.
     *
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo
     */
    public function interviewer()
    {
        return $this->belongsTo(User::class, 'interviewer_id')
            ->where('role', 'interviewer')
            ->withTrashed();
    }

    /**
     * Update interview status with HIPAA-compliant logging.
     *
     * @param string $status
     * @return bool
     * @throws \InvalidArgumentException
     */
    public function updateStatus(string $status): bool
    {
        // Validate status
        if (!in_array($status, self::INTERVIEW_STATUSES)) {
            throw new \InvalidArgumentException('Invalid interview status');
        }

        $oldStatus = $this->status;
        $this->status = $status;

        // Log status change
        $this->logAuditTrail('status_updated', [
            'old_status' => $oldStatus,
            'new_status' => $status
        ]);

        // Update enrollment status if interview completed
        if ($status === 'completed') {
            $this->enrollment->updateStatus('interview_completed');
        }

        return $this->save();
    }

    /**
     * Reschedule interview with validation and notification.
     *
     * @param Carbon $newDateTime
     * @return bool
     * @throws \InvalidArgumentException
     */
    public function reschedule(Carbon $newDateTime): bool
    {
        // Validate new datetime is in future
        if ($newDateTime->isPast()) {
            throw new \InvalidArgumentException('Interview cannot be scheduled in the past');
        }

        // Check interviewer availability
        if (!$this->checkInterviewerAvailability($newDateTime)) {
            throw new \InvalidArgumentException('Interviewer is not available at the specified time');
        }

        $oldDateTime = $this->scheduled_at;
        $this->scheduled_at = $newDateTime;
        $this->status = 'rescheduled';

        // Log rescheduling
        $this->logAuditTrail('rescheduled', [
            'old_datetime' => $oldDateTime,
            'new_datetime' => $newDateTime
        ]);

        return $this->save();
    }

    /**
     * Update interview notes with encryption.
     *
     * @param array $notes
     * @return bool
     */
    public function updateNotes(array $notes): bool
    {
        // Encrypt notes before saving
        $this->encrypted_notes = Crypt::encryptString(json_encode($notes));

        // Log notes update
        $this->logAuditTrail('notes_updated', [
            'timestamp' => now()
        ]);

        return $this->save();
    }

    /**
     * Generate new HIPAA-compliant video session.
     *
     * @return string
     * @throws \RuntimeException
     */
    public function generateVideoSession(): string
    {
        // Validate interview is scheduled
        if ($this->status !== 'scheduled') {
            throw new \RuntimeException('Interview must be in scheduled status');
        }

        // Generate secure session via video provider
        try {
            $sessionId = app($this->video_provider)->createSession([
                'interview_id' => $this->id,
                'scheduled_at' => $this->scheduled_at,
                'media_mode' => 'routed',
                'archive_mode' => 'manual',
                'encryption' => true
            ]);

            $this->video_session_id = $sessionId;

            // Log session creation
            $this->logAuditTrail('video_session_created', [
                'provider' => $this->video_provider,
                'session_id' => $sessionId
            ]);

            $this->save();

            return $sessionId;
        } catch (\Exception $e) {
            $this->logAuditTrail('video_session_failed', [
                'error' => $e->getMessage()
            ]);
            throw new \RuntimeException('Failed to create video session');
        }
    }

    /**
     * Check interviewer availability for given datetime.
     *
     * @param Carbon $dateTime
     * @return bool
     */
    protected function checkInterviewerAvailability(Carbon $dateTime): bool
    {
        return !$this->interviewer
            ->interviews()
            ->where('scheduled_at', $dateTime)
            ->where('id', '!=', $this->id)
            ->where('status', '!=', 'cancelled')
            ->exists();
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
            'interview_id' => $this->id,
            'enrollment_id' => $this->enrollment_id,
            'interviewer_id' => $this->interviewer_id,
            'action' => $action,
            'details' => $details,
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
            'timestamp' => now()
        ];

        // Update internal audit trail
        $auditTrail = $this->audit_trail ?? [];
        $auditTrail[] = $logData;
        $this->audit_trail = $auditTrail;

        // Log to external audit system
        activity()
            ->performedOn($this)
            ->withProperties($logData)
            ->log('interview_activity');
    }
}