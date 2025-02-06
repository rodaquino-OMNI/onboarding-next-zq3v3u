<?php

namespace App\Notifications;

use App\Models\Interview;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;

/**
 * HIPAA-compliant notification for interview scheduling
 * 
 * @package App\Notifications
 * @version 1.0.0
 */
class InterviewScheduled extends Notification implements ShouldQueue
{
    use Queueable;

    /**
     * Interview instance
     *
     * @var Interview
     */
    protected $interview;

    /**
     * Commit after database transactions
     *
     * @var bool
     */
    public $afterCommit = true;

    /**
     * Number of times the job may be attempted
     *
     * @var int
     */
    public $tries = 3;

    /**
     * Timeout in seconds
     *
     * @var int
     */
    public $timeout = 30;

    /**
     * Create a new notification instance.
     *
     * @param Interview $interview
     * @return void
     */
    public function __construct(Interview $interview)
    {
        $this->interview = $interview;
        $this->logAuditTrail('notification_created');
    }

    /**
     * Get the notification's delivery channels.
     *
     * @param mixed $notifiable
     * @return array
     */
    public function via($notifiable): array
    {
        $channels = ['mail', 'database'];

        $this->logAuditTrail('channels_selected', [
            'channels' => $channels,
            'recipient_id' => $notifiable->id
        ]);

        return $channels;
    }

    /**
     * Get the mail representation of the notification.
     *
     * @param mixed $notifiable
     * @return \Illuminate\Notifications\Messages\MailMessage
     */
    public function toMail($notifiable): MailMessage
    {
        // Get user's preferred language and timezone
        $language = $notifiable->language ?? 'en';
        $timezone = $notifiable->timezone ?? 'UTC';

        // Format interview date/time in user's timezone
        $scheduledAt = Carbon::parse($this->interview->scheduled_at)
            ->setTimezone($timezone)
            ->translatedFormat('l, F j, Y \a\t g:i A');

        // Generate secure video session link
        $videoSessionUrl = $this->generateSecureVideoLink($notifiable);

        $mailData = $this->sanitizeContent([
            'interview_id' => $this->interview->id,
            'scheduled_at' => $scheduledAt,
            'interviewer_name' => $this->interview->interviewer->name,
            'video_url' => $videoSessionUrl
        ]);

        $this->logAuditTrail('email_prepared', [
            'recipient_id' => $notifiable->id,
            'language' => $language
        ]);

        return (new MailMessage)
            ->subject(__('notifications.interview.subject', [], $language))
            ->greeting(__('notifications.interview.greeting', [], $language))
            ->line(__('notifications.interview.scheduled_for', ['datetime' => $scheduledAt], $language))
            ->line(__('notifications.interview.interviewer', ['name' => $mailData['interviewer_name']], $language))
            ->action(__('notifications.interview.join_button', [], $language), $mailData['video_url'])
            ->line(__('notifications.interview.preparation', [], $language))
            ->line(__('notifications.interview.support', [], $language));
    }

    /**
     * Get the database representation of the notification.
     *
     * @param mixed $notifiable
     * @return array
     */
    public function toDatabase($notifiable): array
    {
        $data = $this->sanitizeContent([
            'interview_id' => $this->interview->id,
            'scheduled_at' => $this->interview->scheduled_at,
            'interviewer_id' => $this->interview->interviewer_id,
            'status' => 'scheduled'
        ]);

        $this->logAuditTrail('database_stored', [
            'recipient_id' => $notifiable->id
        ]);

        return $data;
    }

    /**
     * Generate secure video session link.
     *
     * @param User $user
     * @return string
     */
    protected function generateSecureVideoLink(User $user): string
    {
        $token = Crypt::encryptString(json_encode([
            'user_id' => $user->id,
            'interview_id' => $this->interview->id,
            'expires_at' => now()->addHours(2)->timestamp
        ]));

        return config('app.url') . '/video/join/' . urlencode($token);
    }

    /**
     * Sanitize content for HIPAA compliance.
     *
     * @param array $content
     * @return array
     */
    protected function sanitizeContent(array $content): array
    {
        // Remove any PHI markers
        $phiPatterns = [
            '/\b\d{3}-\d{2}-\d{4}\b/', // SSN
            '/\b\d{10}\b/', // Account numbers
            '/\b[A-Z]{2}\d{6}\b/' // Medical record numbers
        ];

        foreach ($content as $key => $value) {
            if (is_string($value)) {
                $content[$key] = preg_replace($phiPatterns, '[REDACTED]', $value);
            }
        }

        return $content;
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
            'notification_type' => 'InterviewScheduled',
            'interview_id' => $this->interview->id,
            'action' => $action,
            'details' => $details,
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent(),
            'timestamp' => now()
        ];

        Log::channel('audit')->info('Interview notification activity', $logData);

        activity()
            ->performedOn($this->interview)
            ->withProperties($logData)
            ->log('notification_activity');
    }
}