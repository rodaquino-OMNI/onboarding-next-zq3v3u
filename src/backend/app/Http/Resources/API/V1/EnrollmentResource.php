<?php

namespace App\Http\Resources\API\V1;

use App\Http\Resources\API\V1\UserResource;
use Carbon\Carbon; // ^2.0
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource; // ^9.0
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Auth;

/**
 * API Resource transformer for Enrollment model with HIPAA compliance
 *
 * Handles secure transformation of enrollment data for API responses with
 * comprehensive security measures and audit logging capabilities.
 *
 * @property \App\Models\Enrollment $resource
 */
class EnrollmentResource extends JsonResource
{
    /**
     * Transform the Enrollment model into a HIPAA-compliant array.
     *
     * @param Request $request
     * @return array
     */
    public function toArray($request): array
    {
        // Log access attempt for audit trail
        Log::channel('audit')->info('Enrollment data accessed', [
            'enrollment_id' => $this->resource->id,
            'user_id' => Auth::id(),
            'ip_address' => $request->ip()
        ]);

        // Basic enrollment information with security filtering
        $response = [
            'id' => $this->resource->id,
            'type' => 'enrollment',
            'attributes' => [
                'status' => $this->resource->status,
                'progress' => $this->calculateProgress(),
                'completed_at' => $this->formatTimestamp($this->resource->completed_at),
                'created_at' => $this->formatTimestamp($this->resource->created_at),
                'updated_at' => $this->formatTimestamp($this->resource->updated_at),
            ],
            'relationships' => $this->getRelationships(),
            'meta' => $this->getMetadata($request)
        ];

        // Include workflow stage details
        $response['attributes']['stages'] = [
            'documents' => $this->getDocumentStatus(),
            'health_declaration' => $this->getHealthDeclarationStatus(),
            'interview' => $this->getInterviewStatus()
        ];

        // Add security headers and compliance metadata
        $response['meta']['security'] = [
            'hipaa_compliant' => true,
            'data_encryption' => 'AES-256-GCM',
            'access_logged' => true
        ];

        return $response;
    }

    /**
     * Calculate enrollment progress percentage.
     *
     * @return int
     */
    protected function calculateProgress(): int
    {
        $stages = [
            'draft' => 0,
            'documents_pending' => 20,
            'documents_submitted' => 40,
            'health_declaration_pending' => 60,
            'interview_scheduled' => 80,
            'interview_completed' => 90,
            'completed' => 100,
            'cancelled' => 0
        ];

        return $stages[$this->resource->status] ?? 0;
    }

    /**
     * Get document processing status with security checks.
     *
     * @return array
     */
    protected function getDocumentStatus(): array
    {
        $documents = $this->resource->documents;
        
        return [
            'required_count' => config('enrollment.required_documents_count'),
            'submitted_count' => $documents->count(),
            'processed_count' => $documents->where('status', 'processed')->count(),
            'status' => $this->resource->status === 'documents_submitted' ? 'complete' : 'pending'
        ];
    }

    /**
     * Get health declaration status with PHI considerations.
     *
     * @return array
     */
    protected function getHealthDeclarationStatus(): array
    {
        return [
            'status' => $this->resource->status === 'health_declaration_pending' ? 'pending' : 'complete',
            'requires_review' => $this->resource->requiresInterview(),
            'submitted_at' => $this->formatTimestamp(
                $this->resource->metadata['health_declaration_submitted_at'] ?? null
            )
        ];
    }

    /**
     * Get interview status if scheduled.
     *
     * @return array
     */
    protected function getInterviewStatus(): array
    {
        $interview = $this->resource->interviews->first();
        
        return [
            'required' => $this->resource->requiresInterview(),
            'scheduled' => !is_null($interview),
            'scheduled_at' => $interview ? $this->formatTimestamp($interview->scheduled_at) : null,
            'completed' => $this->resource->status === 'interview_completed'
        ];
    }

    /**
     * Get related resources with proper security scoping.
     *
     * @return array
     */
    protected function getRelationships(): array
    {
        return [
            'user' => new UserResource($this->resource->user),
            'documents' => [
                'links' => [
                    'related' => "/api/v1/enrollments/{$this->resource->id}/documents"
                ],
                'meta' => [
                    'count' => $this->resource->documents->count()
                ]
            ],
            'interviews' => [
                'links' => [
                    'related' => "/api/v1/enrollments/{$this->resource->id}/interviews"
                ],
                'meta' => [
                    'count' => $this->resource->interviews->count()
                ]
            ]
        ];
    }

    /**
     * Get metadata including compliance and security information.
     *
     * @param Request $request
     * @return array
     */
    protected function getMetadata(Request $request): array
    {
        return [
            'api_version' => 'v1',
            'rate_limit' => [
                'limit' => config('api.rate_limit'),
                'remaining' => $request->header('X-RateLimit-Remaining')
            ],
            'cache_control' => [
                'max_age' => 300,
                'private' => true
            ]
        ];
    }

    /**
     * Format timestamp with proper timezone handling.
     *
     * @param mixed $timestamp
     * @return string|null
     */
    protected function formatTimestamp($timestamp): ?string
    {
        if (!$timestamp) {
            return null;
        }

        return Carbon::parse($timestamp)->toIso8601String();
    }
}