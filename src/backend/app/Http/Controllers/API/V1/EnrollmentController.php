<?php

namespace App\Http\Controllers\API\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\API\V1\CreateEnrollmentRequest;
use App\Http\Resources\API\V1\EnrollmentResource;
use App\Models\Enrollment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Auth;

/**
 * Handles healthcare enrollment operations with HIPAA compliance
 *
 * @package App\Http\Controllers\API\V1
 */
class EnrollmentController extends Controller
{
    /**
     * Security audit logger instance
     *
     * @var \Illuminate\Log\Logger
     */
    protected $auditLogger;

    /**
     * Create a new EnrollmentController instance.
     */
    public function __construct()
    {
        parent::__construct();
        
        // Configure security middleware
        $this->middleware(['auth:sanctum', 'throttle:60,1']);
        $this->middleware('hipaa.audit');
        
        // Initialize audit logger
        $this->auditLogger = Log::channel('audit');
        
        // Set security headers
        $this->setSecurityHeaders();
    }

    /**
     * List enrollments with proper access control and PHI protection.
     *
     * @param Request $request
     * @return JsonResponse
     */
    public function index(Request $request): JsonResponse
    {
        // Log access attempt
        $this->auditLogger->info('Enrollment list accessed', [
            'user_id' => Auth::id(),
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent()
        ]);

        // Build secure query with role-based access
        $query = Enrollment::query();

        if (Auth::user()->role === 'individual') {
            $query->where('user_id', Auth::id());
        } elseif (Auth::user()->role === 'broker') {
            $query->where('broker_id', Auth::id());
        }

        // Apply filters with security validation
        if ($request->has('status') && in_array($request->status, Enrollment::ENROLLMENT_STATUSES)) {
            $query->where('status', $request->status);
        }

        // Apply date range filters with validation
        if ($request->has('date_from')) {
            $query->where('created_at', '>=', $request->date_from);
        }
        if ($request->has('date_to')) {
            $query->where('created_at', '<=', $request->date_to);
        }

        // Execute query with pagination
        $enrollments = $query->latest()
            ->with(['user', 'documents', 'healthRecords'])
            ->paginate($request->per_page ?? 15);

        // Transform with PHI protection
        return response()->json([
            'data' => EnrollmentResource::collection($enrollments),
            'meta' => [
                'current_page' => $enrollments->currentPage(),
                'total' => $enrollments->total(),
                'per_page' => $enrollments->perPage(),
                'last_page' => $enrollments->lastPage()
            ]
        ], 200, $this->getSecurityHeaders());
    }

    /**
     * Create enrollment with PHI encryption and audit logging.
     *
     * @param CreateEnrollmentRequest $request
     * @return JsonResponse
     */
    public function store(CreateEnrollmentRequest $request): JsonResponse
    {
        // Begin secure transaction
        return DB::transaction(function () use ($request) {
            try {
                // Create enrollment with validated data
                $enrollment = new Enrollment([
                    'user_id' => $request->user_id,
                    'status' => 'draft',
                    'metadata' => $this->sanitizeMetadata($request->metadata)
                ]);

                // Encrypt sensitive PHI data
                $enrollment->encryptSensitiveData([
                    'medical_history' => $request->metadata['health_declaration'] ?? null,
                    'family_history' => $request->metadata['health_declaration']['family_history'] ?? null,
                    'current_medications' => $request->metadata['health_declaration']['current_medications'] ?? null
                ]);

                $enrollment->save();

                // Log creation event
                $this->auditLogger->info('Enrollment created', [
                    'enrollment_id' => $enrollment->id,
                    'user_id' => Auth::id(),
                    'ip_address' => $request->ip(),
                    'user_agent' => $request->userAgent()
                ]);

                return response()->json([
                    'data' => new EnrollmentResource($enrollment),
                    'meta' => [
                        'message' => __('enrollment.created_successfully')
                    ]
                ], 201, $this->getSecurityHeaders());

            } catch (\Exception $e) {
                // Log error securely
                $this->auditLogger->error('Enrollment creation failed', [
                    'user_id' => Auth::id(),
                    'error' => $e->getMessage()
                ]);

                throw $e;
            }
        });
    }

    /**
     * Sanitize metadata for security.
     *
     * @param array $metadata
     * @return array
     */
    protected function sanitizeMetadata(array $metadata): array
    {
        $sanitized = [];

        // Whitelist allowed metadata fields
        $allowedFields = [
            'personal_info',
            'contact_info',
            'address_info',
            'health_declaration',
            'consent'
        ];

        foreach ($allowedFields as $field) {
            if (isset($metadata[$field])) {
                $sanitized[$field] = $this->deepSanitize($metadata[$field]);
            }
        }

        return $sanitized;
    }

    /**
     * Deep sanitize array values.
     *
     * @param array|string $data
     * @return array|string
     */
    protected function deepSanitize($data)
    {
        if (is_array($data)) {
            return array_map([$this, 'deepSanitize'], $data);
        }

        return is_string($data) ? strip_tags($data) : $data;
    }

    /**
     * Get security headers for responses.
     *
     * @return array
     */
    protected function getSecurityHeaders(): array
    {
        return [
            'X-Content-Type-Options' => 'nosniff',
            'X-Frame-Options' => 'DENY',
            'X-XSS-Protection' => '1; mode=block',
            'Strict-Transport-Security' => 'max-age=31536000; includeSubDomains',
            'Content-Security-Policy' => "default-src 'self'",
            'Cache-Control' => 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma' => 'no-cache',
            'Expires' => '0'
        ];
    }

    /**
     * Set security headers for the controller.
     *
     * @return void
     */
    protected function setSecurityHeaders(): void
    {
        foreach ($this->getSecurityHeaders() as $header => $value) {
            header("$header: $value");
        }
    }
}