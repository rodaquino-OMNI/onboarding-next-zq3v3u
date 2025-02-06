<?php

namespace App\Http\Resources\API\V1;

use App\Models\User;
use Carbon\Carbon; // ^2.0
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource; // ^9.0

/**
 * API Resource transformer for User model with HIPAA/GDPR compliance
 *
 * Handles secure transformation of user data for API responses with proper
 * attribute formatting, relationship loading, and security filtering.
 *
 * @property User $resource
 * @property-read array $permissions
 * @property-read string $role
 */
class UserResource extends JsonResource
{
    /**
     * Fields that are allowed to be included in the response
     *
     * @var array
     */
    protected $allowedFields = [
        'id',
        'name',
        'email',
        'role',
        'language',
        'preferences',
        'email_verified_at',
        'last_login_at',
        'created_at'
    ];

    /**
     * Fields requiring special security handling for HIPAA compliance
     *
     * @var array
     */
    protected $sensitiveFields = [
        'email',
        'preferences',
        'last_login_ip'
    ];

    /**
     * Transform the User model into a HIPAA-compliant array.
     *
     * @param Request $request
     * @return array
     */
    public function toArray($request): array
    {
        // Validate resource instance
        if (!$this->resource instanceof User) {
            return [];
        }

        // Basic user information with security filtering
        $response = [
            'id' => $this->resource->id,
            'type' => 'user',
            'attributes' => [
                'name' => $this->resource->name,
                'email' => $this->maskSensitiveData($this->resource->email),
                'role' => $this->resource->role,
                'language' => $this->resource->language,
                'preferences' => $this->filterPreferences($this->resource->preferences),
                'is_verified' => !is_null($this->resource->email_verified_at),
            ],
            'meta' => [
                'created_at' => $this->formatTimestamp($this->resource->created_at),
                'last_login' => $this->formatTimestamp($this->resource->last_login_at),
            ]
        ];

        // Add role-specific information
        if ($this->shouldIncludeRoleData($request)) {
            $response['attributes']['role_data'] = $this->getRoleSpecificData();
        }

        // Add relationships based on role
        $response['relationships'] = $this->getRelationships();

        // Add versioning information
        $response['meta']['api_version'] = 'v1';

        return $response;
    }

    /**
     * Format timestamp with proper timezone handling
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
     * Mask sensitive data for HIPAA compliance
     *
     * @param string $value
     * @return string
     */
    protected function maskSensitiveData(string $value): string
    {
        if (filter_var($value, FILTER_VALIDATE_EMAIL)) {
            [$local, $domain] = explode('@', $value);
            return substr($local, 0, 1) . str_repeat('*', strlen($local) - 1) . '@' . $domain;
        }

        return str_repeat('*', strlen($value));
    }

    /**
     * Filter user preferences for security
     *
     * @param array|null $preferences
     * @return array
     */
    protected function filterPreferences(?array $preferences): array
    {
        if (!$preferences) {
            return [];
        }

        $allowedPreferences = [
            'notifications',
            'language',
            'timezone',
            'accessibility'
        ];

        return array_intersect_key($preferences, array_flip($allowedPreferences));
    }

    /**
     * Get role-specific data if authorized
     *
     * @return array
     */
    protected function getRoleSpecificData(): array
    {
        $roleData = [];

        switch ($this->resource->role) {
            case 'interviewer':
                $roleData['interview_count'] = $this->resource->interviews()->count();
                break;
            case 'broker':
                $roleData['enrollment_count'] = $this->resource->enrollments()->count();
                break;
            case 'admin':
                $roleData['access_level'] = 'full';
                break;
        }

        return $roleData;
    }

    /**
     * Get relationships based on user role
     *
     * @return array
     */
    protected function getRelationships(): array
    {
        $relationships = [];

        if ($this->resource->role === 'interviewer') {
            $relationships['interviews'] = [
                'links' => [
                    'related' => '/api/v1/interviews?interviewer=' . $this->resource->id
                ]
            ];
        }

        if (in_array($this->resource->role, ['individual', 'broker'])) {
            $relationships['enrollments'] = [
                'links' => [
                    'related' => '/api/v1/enrollments?user=' . $this->resource->id
                ]
            ];
        }

        return $relationships;
    }

    /**
     * Check if role-specific data should be included
     *
     * @param Request $request
     * @return bool
     */
    protected function shouldIncludeRoleData(Request $request): bool
    {
        return $request->user() && 
               ($request->user()->id === $this->resource->id || 
                $request->user()->role === 'admin');
    }
}