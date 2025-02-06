<?php

namespace App\Notifications;

use App\Models\Enrollment;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * HIPAA-compliant notification for enrollment completion
 *
 * @property Enrollment $enrollment
 * @property array $securityConfig
 * @property array $languagePreferences
 */
class EnrollmentCompleted extends Notification implements ShouldQueue
{
    use Queueable;

    /**
     * The enrollment instance.
     *
     * @var Enrollment
     */
    protected $enrollment;

    /**
     * Security configuration for HIPAA compliance.
     *
     * @var array
     */
    protected $securityConfig;

    /**
     * Language preferences for notification content.
     *
     * @var array
     */
    protected $languagePreferences;

    /**
     * Notification tracking ID.
     *
     * @var string
     */
    protected $trackingId;

    /**
     * Create a new notification instance.
     *
     * @param Enrollment $enrollment
     * @param array $securityConfig
     * @return void
     * @throws \InvalidArgumentException
     */
    public function __construct(Enrollment $enrollment, array $securityConfig = [])
    {
        if (!$enrollment->isComplete()) {
            throw new \InvalidArgumentException('Enrollment must be complete to send completion notification');
        }

        $this->enrollment = $enrollment;
        $this->securityConfig = array_merge([
            'encrypt_content' => true,
            'require_signature' => true,
            'audit_trail' => true
        ], $securityConfig);

        $this->languagePreferences = [
            'locale' => $enrollment->user->language ?? 'en',
            'fallback_locale' => 'en',
            'rtl_support' => in_array($enrollment->user->language, ['ar', 'he'])
        ];

        $this->trackingId = Str::uuid()->toString();
        
        $this->logAuditTrail('notification_created');
    }

    /**
     * Get the notification's delivery channels with rate limiting.
     *
     * @param mixed $notifiable
     * @return array
     */
    public function via($notifiable)
    {
        $channels = ['mail', 'database'];

        // Check rate limiting for channels
        $rateLimitKey = "notification_limit:{$notifiable->id}";
        $rateLimit = cache()->get($rateLimitKey, 0);

        if ($rateLimit > 10) { // Max 10 notifications per hour
            $channels = ['database']; // Fallback to database only
            Log::warning('Notification rate limit exceeded', [
                'user_id' => $notifiable->id,
                'tracking_id' => $this->trackingId
            ]);
        }

        cache()->put($rateLimitKey, $rateLimit + 1, now()->addHour());

        $this->logAuditTrail('channels_selected', ['channels' => $channels]);

        return $channels;
    }

    /**
     * Get the mail representation of the notification.
     *
     * @param mixed $notifiable
     * @return \Illuminate\Notifications\Messages\MailMessage
     */
    public function toMail($notifiable)
    {
        $locale = $this->languagePreferences['locale'];
        app()->setLocale($locale);

        $mailMessage = (new MailMessage)
            ->subject(__('notifications.enrollment_completed.subject'))
            ->greeting(__('notifications.enrollment_completed.greeting', [
                'name' => $notifiable->name
            ]))
            ->line(__('notifications.enrollment_completed.message'))
            ->action(
                __('notifications.enrollment_completed.action'),
                $this->generateSecureUrl($notifiable)
            )
            ->line(__('notifications.enrollment_completed.footer'));

        // Add security headers for HIPAA compliance
        $mailMessage->withSwiftMessage(function ($message) {
            $message->getHeaders()
                ->addTextHeader('X-HIPAA-Compliance', 'enforced')
                ->addTextHeader('X-Notification-ID', $this->trackingId);
        });

        // Handle RTL languages
        if ($this->languagePreferences['rtl_support']) {
            $mailMessage->viewData['direction'] = 'rtl';
        }

        $this->logAuditTrail('email_prepared', [
            'locale' => $locale,
            'recipient' => Crypt::encryptString($notifiable->email)
        ]);

        return $mailMessage;
    }

    /**
     * Get the array representation of the notification.
     *
     * @param mixed $notifiable
     * @return array
     */
    public function toDatabase($notifiable)
    {
        $data = [
            'enrollment_id' => $this->enrollment->id,
            'completed_at' => $this->enrollment->completed_at->toISOString(),
            'tracking_id' => $this->trackingId,
            'notification_type' => 'enrollment_completed',
            'metadata' => [
                'locale' => $this->languagePreferences['locale'],
                'security_level' => 'hipaa_compliant'
            ]
        ];

        // Encrypt sensitive data if configured
        if ($this->securityConfig['encrypt_content']) {
            $data['enrollment_id'] = Crypt::encryptString($data['enrollment_id']);
            $data['completed_at'] = Crypt::encryptString($data['completed_at']);
        }

        $this->logAuditTrail('database_notification_created', [
            'tracking_id' => $this->trackingId
        ]);

        return $data;
    }

    /**
     * Generate secure URL for notification action.
     *
     * @param mixed $notifiable
     * @return string
     */
    protected function generateSecureUrl($notifiable)
    {
        $url = route('enrollment.show', [
            'enrollment' => $this->enrollment->id,
            'notification' => $this->trackingId
        ]);

        if ($this->securityConfig['require_signature']) {
            $signature = hash_hmac('sha256', $url, config('app.key'));
            $url .= "?signature={$signature}";
        }

        return $url;
    }

    /**
     * Log audit trail for HIPAA compliance.
     *
     * @param string $action
     * @param array $details
     * @return void
     */
    protected function logAuditTrail(string $action, array $details = [])
    {
        Log::channel('audit')->info('Enrollment notification activity', [
            'action' => $action,
            'tracking_id' => $this->trackingId,
            'enrollment_id' => $this->enrollment->id,
            'user_id' => $this->enrollment->user_id,
            'details' => $details,
            'ip_address' => request()->ip(),
            'timestamp' => now()->toISOString()
        ]);
    }
}