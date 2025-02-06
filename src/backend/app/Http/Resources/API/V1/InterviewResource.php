<?php

namespace App\Http\Resources\API\V1;

use Illuminate\Http\Resources\Json\JsonResource;
use Carbon\Carbon;
use App\Models\Interview;
use App\Models\User;

/**
 * API Resource for transforming Interview models into HIPAA-compliant JSON responses
 * 
 * @property Interview $resource
 * @property-read array $statusTransitions
 * @property-read bool $isVideoSessionActive
 */
class InterviewResource extends JsonResource
{
    /**
     * Fields allowed in the API response
     *
     * @var array
     */
    protected $allowedFields = [
        'id',
        'status',
        'scheduled_at',
        'video_provider',
        'duration_minutes',
        'status_transitions'
    ];

    /**
     * Fields requiring special HIPAA handling
     *
     * @var array
     */
    protected $sensitiveFields = [
        'notes',
        'video_session_id'
    ];

    /**
     * Transform the interview into a HIPAA-compliant array.
     *
     * @param  \Illuminate\Http\Request  $request
     * @return array
     */
    public function toArray($request): array
    {
        // Basic interview attributes
        $data = [
            'id' => $this->id,
            'type' => 'interview',
            'attributes' => [
                'status' => $this->status,
                'scheduled_at' => $this->scheduled_at?->toIso8601String(),
                'video_provider' => $this->video_provider,
                'duration_minutes' => $this->duration_minutes,
                'is_video_session_active' => $this->isVideoSessionActive(),
            ],
            'relationships' => [
                'interviewer' => [
                    'data' => [
                        'id' => $this->interviewer->id,
                        'type' => 'user',
                        'attributes' => [
                            'name' => $this->interviewer->name,
                            'role' => $this->interviewer->role,
                            'specialization' => $this->interviewer->specialization
                        ]
                    ]
                ]
            ],
            'meta' => [
                'created_at' => $this->created_at?->toIso8601String(),
                'updated_at' => $this->updated_at?->toIso8601String(),
                'status_transitions' => $this->withStatusTransitions()
            ]
        ];

        // Include encrypted notes if user is authorized
        if ($request->user()->can('view', $this->resource) && $this->encrypted_notes) {
            $data['attributes']['notes'] = $this->encrypted_notes;
        }

        // Include video session data for active participants
        if ($this->isVideoSessionActive() && 
            ($request->user()->id === $this->interviewer_id || 
             $request->user()->id === $this->enrollment->user_id)) {
            $data['attributes']['video_session'] = [
                'provider' => $this->video_provider,
                'session_id' => $this->video_session_id,
                'token' => $this->generateVideoToken($request->user())
            ];
        }

        // Generate ETag for caching
        $data['meta']['etag'] = $this->generateEtag($data);

        return $data;
    }

    /**
     * Transform status transitions with timestamps.
     *
     * @return array
     */
    protected function withStatusTransitions(): array
    {
        if (!$this->status_transitions) {
            return [];
        }

        return collect($this->status_transitions)
            ->map(function ($transition) {
                return [
                    'from' => $transition['old_status'],
                    'to' => $transition['new_status'],
                    'timestamp' => Carbon::parse($transition['timestamp'])->toIso8601String(),
                    'actor' => [
                        'id' => $transition['actor_id'],
                        'type' => 'user'
                    ]
                ];
            })
            ->values()
            ->all();
    }

    /**
     * Check if video session is currently active.
     *
     * @return bool
     */
    protected function isVideoSessionActive(): bool
    {
        if (!$this->video_session_id || !$this->scheduled_at) {
            return false;
        }

        $now = Carbon::now();
        $scheduledTime = Carbon::parse($this->scheduled_at);
        
        return $this->status === 'in_progress' && 
               $now->between(
                   $scheduledTime->copy()->subMinutes(5),
                   $scheduledTime->copy()->addMinutes($this->duration_minutes ?? 30)
               );
    }

    /**
     * Generate secure video session token.
     *
     * @param User $user
     * @return string|null
     */
    protected function generateVideoToken(User $user): ?string
    {
        if (!$this->video_session_id || !$this->isVideoSessionActive()) {
            return null;
        }

        return app($this->video_provider)->generateToken([
            'session_id' => $this->video_session_id,
            'user_id' => $user->id,
            'role' => $user->role,
            'expire_time' => Carbon::now()->addHours(1)->timestamp
        ]);
    }

    /**
     * Generate ETag for response caching.
     *
     * @param array $data
     * @return string
     */
    protected function generateEtag(array $data): string
    {
        return md5(json_encode($data) . $this->updated_at->timestamp);
    }
}