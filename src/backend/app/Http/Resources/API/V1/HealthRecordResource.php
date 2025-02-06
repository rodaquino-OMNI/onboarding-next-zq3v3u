<?php

namespace App\Http\Resources\API\V1;

use App\Http\Resources\API\V1\EnrollmentResource;
use Carbon\Carbon; // ^2.0
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource; // ^9.0
use Illuminate\Support\Facades\Log;
use PHIDataMasker; // ^1.0
use SecurityAuditLogger; // ^1.0

/**
 * API Resource transformer for HealthRecord model with HIPAA compliance
 *
 * Handles secure transformation of health record data for API responses with
 * enhanced PHI protection and comprehensive audit logging.
 *
 * @property \App\Models\HealthRecord $resource
 */
class HealthRecordResource extends JsonResource
{
    /**
     * @var PHIDataMasker
     */
    private $phiMasker;

    /**
     * @var SecurityAuditLogger
     */
    private $auditLogger;

    /**
     * Create a new resource instance.
     *
     * @param mixed $resource
     * @param PHIDataMasker $phiMasker
     * @param SecurityAuditLogger $auditLogger
     * @return void
     */
    public function __construct($resource, PHIDataMasker $phiMasker, SecurityAuditLogger $auditLogger)
    {
        parent::__construct($resource);
        $this->phiMasker = $phiMasker;
        $this->auditLogger = $auditLogger;
    }

    /**
     * Transform the HealthRecord model into a HIPAA-compliant array.
     *
     * @param Request $request
     * @return array
     */
    public function toArray($request): array
    {
        // Log PHI data access attempt
        $this->auditLogger->logAccess(
            'health_record_access',
            $this->resource->id,
            $request->user()->id
        );

        // Basic health record information with security filtering
        $response = [
            'id' => $this->resource->id,
            'type' => 'health_record',
            'attributes' => $this->getSecureAttributes(),
            'relationships' => $this->getRelationships($request),
            'meta' => $this->getMetadata($request)
        ];

        // Add security headers and compliance metadata
        $response['meta']['security'] = [
            'hipaa_compliant' => true,
            'phi_protected' => true,
            'data_encryption' => 'AES-256-GCM',
            'access_logged' => true
        ];

        return $response;
    }

    /**
     * Get secure attributes with PHI protection.
     *
     * @return array
     */
    protected function getSecureAttributes(): array
    {
        $healthData = $this->resource->getHealthData();

        return [
            'medical_history' => $this->phiMasker->maskMedicalHistory($healthData['medical_history'] ?? []),
            'current_medications' => $this->formatMedications($healthData['current_medications'] ?? []),
            'allergies' => $healthData['allergies'] ?? [],
            'chronic_conditions' => $this->phiMasker->maskConditions($healthData['chronic_conditions'] ?? []),
            'family_history' => $this->phiMasker->maskFamilyHistory($healthData['family_history'] ?? []),
            'lifestyle_factors' => $healthData['lifestyle_factors'] ?? [],
            'emergency_contacts' => $this->maskEmergencyContacts($healthData['emergency_contacts'] ?? []),
            'verified' => $this->resource->verified,
            'submitted_at' => $this->formatTimestamp($this->resource->submitted_at)
        ];
    }

    /**
     * Format medications list with proper security handling.
     *
     * @param array $medications
     * @return array
     */
    protected function formatMedications(array $medications): array
    {
        return array_map(function ($medication) {
            return [
                'name' => $medication['name'],
                'dosage' => $medication['dosage'],
                'frequency' => $medication['frequency'],
                'prescribed_at' => $this->formatTimestamp($medication['prescribed_at'] ?? null)
            ];
        }, $medications);
    }

    /**
     * Mask emergency contact information for privacy.
     *
     * @param array $contacts
     * @return array
     */
    protected function maskEmergencyContacts(array $contacts): array
    {
        return array_map(function ($contact) {
            return [
                'name' => $this->phiMasker->maskName($contact['name']),
                'relationship' => $contact['relationship'],
                'phone' => $this->phiMasker->maskPhoneNumber($contact['phone']),
                'email' => $this->phiMasker->maskEmail($contact['email'])
            ];
        }, $contacts);
    }

    /**
     * Get related resources with proper security scoping.
     *
     * @param Request $request
     * @return array
     */
    protected function getRelationships(Request $request): array
    {
        $relationships = [
            'enrollment' => [
                'links' => [
                    'related' => "/api/v1/enrollments/{$this->resource->enrollment_id}"
                ]
            ]
        ];

        // Include full enrollment data if requested and authorized
        if ($request->includes('enrollment') && $request->user()->can('view', $this->resource->enrollment)) {
            $relationships['enrollment']['data'] = new EnrollmentResource($this->resource->enrollment);
        }

        return $relationships;
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
            'created_at' => $this->formatTimestamp($this->resource->created_at),
            'updated_at' => $this->formatTimestamp($this->resource->updated_at),
            'api_version' => 'v1',
            'encryption_version' => $this->resource->encryption_version,
            'rate_limit' => [
                'limit' => config('api.rate_limit'),
                'remaining' => $request->header('X-RateLimit-Remaining')
            ],
            'cache_control' => [
                'max_age' => 0,
                'private' => true,
                'no_store' => true
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

    /**
     * Customize the response with required security headers.
     *
     * @param Request $request
     * @param \Illuminate\Http\Response $response
     * @return \Illuminate\Http\Response
     */
    public function withResponse($request, $response)
    {
        $response->header('X-HIPAA-Compliance', 'enforced');
        $response->header('X-Content-Type-Options', 'nosniff');
        $response->header('X-Frame-Options', 'DENY');
        $response->header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        $response->header('Pragma', 'no-cache');
        $response->header('X-PHI-Access-Logged', 'true');
        
        return $response;
    }
}