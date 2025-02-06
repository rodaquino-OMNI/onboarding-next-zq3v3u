<?php

use App\Models\User;
use App\Models\Interview;
use Illuminate\Support\Facades\Broadcast;
use Laravel\AuditLog\AuditLog; // ^2.0

/*
|--------------------------------------------------------------------------
| Broadcast Channels
|--------------------------------------------------------------------------
|
| Here you may register all of the event broadcasting channels that your
| application supports. The given channel authorization callbacks are
| used to check if an authenticated user can listen to the channel.
|
*/

/**
 * HIPAA-compliant private channel for video interviews
 */
Broadcast::channel('private-interview.{interviewId}', function (User $user, string $interviewId) {
    try {
        // Validate interview ID format
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $interviewId)) {
            throw new \InvalidArgumentException('Invalid interview ID format');
        }

        // Find interview with enrollment relationship
        $interview = Interview::with('enrollment')->findOrFail($interviewId);

        // Log channel access attempt for HIPAA compliance
        activity()
            ->performedOn($interview)
            ->withProperties([
                'user_id' => $user->id,
                'channel' => "private-interview.{$interviewId}",
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent()
            ])
            ->log('interview_channel_access_attempt');

        // Verify user is either the interviewer or the enrolled user
        $isAuthorized = $user->id === $interview->interviewer_id || 
                       $user->id === $interview->enrollment->user_id;

        // Log authorization result
        activity()
            ->performedOn($interview)
            ->withProperties([
                'user_id' => $user->id,
                'authorized' => $isAuthorized
            ])
            ->log('interview_channel_authorization');

        return $isAuthorized;

    } catch (\Exception $e) {
        // Log error and deny access
        activity()
            ->withProperties([
                'user_id' => $user->id,
                'interview_id' => $interviewId,
                'error' => $e->getMessage()
            ])
            ->log('interview_channel_error');

        return false;
    }
});

/**
 * Private channel for enrollment status updates
 */
Broadcast::channel('private-enrollment.{enrollmentId}', function (User $user, string $enrollmentId) {
    try {
        // Validate enrollment ID format
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', $enrollmentId)) {
            throw new \InvalidArgumentException('Invalid enrollment ID format');
        }

        // Log channel access attempt
        activity()
            ->withProperties([
                'user_id' => $user->id,
                'enrollment_id' => $enrollmentId,
                'channel' => "private-enrollment.{$enrollmentId}",
                'ip_address' => request()->ip()
            ])
            ->log('enrollment_channel_access_attempt');

        // Check user role and ownership
        $isAuthorized = $user->hasRole('admin') || 
                       $user->hasRole('broker') ||
                       $user->enrollments()->where('id', $enrollmentId)->exists();

        // Log authorization result
        activity()
            ->withProperties([
                'user_id' => $user->id,
                'enrollment_id' => $enrollmentId,
                'authorized' => $isAuthorized
            ])
            ->log('enrollment_channel_authorization');

        return $isAuthorized;

    } catch (\Exception $e) {
        // Log error and deny access
        activity()
            ->withProperties([
                'user_id' => $user->id,
                'enrollment_id' => $enrollmentId,
                'error' => $e->getMessage()
            ])
            ->log('enrollment_channel_error');

        return false;
    }
});