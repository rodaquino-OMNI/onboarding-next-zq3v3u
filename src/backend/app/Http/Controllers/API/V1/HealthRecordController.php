<?php

namespace App\Http\Controllers\API\V1;

use App\Http\Controllers\Controller; // ^9.0
use App\Models\HealthRecord;
use App\Http\Resources\API\V1\HealthRecordResource;
use App\Http\Requests\API\V1\UpdateHealthRecordRequest;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse; // ^9.0
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Auth;

/**
 * HIPAA-compliant controller for managing health records with comprehensive security
 * and audit logging capabilities.
 */
class HealthRecordController extends Controller
{
    /**
     * Display a paginated list of health records with PHI protection.
     *
     * @param Request $request
     * @return JsonResponse
     */
    public function index(Request $request): JsonResponse
    {
        // Log access attempt for HIPAA audit
        Log::channel('hipaa-audit')->info('Health records list accessed', [
            'user_id' => Auth::id(),
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent()
        ]);

        // Get enrollment ID from request for filtering
        $enrollmentId = $request->input('enrollment_id');
        $query = HealthRecord::query();

        if ($enrollmentId) {
            $query->where('enrollment_id', $enrollmentId);
        }

        // Apply role-based access control
        if (!Auth::user()->hasRole('admin')) {
            $query->whereHas('enrollment', function ($q) {
                $q->where('user_id', Auth::id());
            });
        }

        $healthRecords = $query->paginate($request->input('per_page', 15));

        return response()->json([
            'data' => HealthRecordResource::collection($healthRecords),
            'meta' => [
                'total' => $healthRecords->total(),
                'per_page' => $healthRecords->perPage(),
                'current_page' => $healthRecords->currentPage(),
                'last_page' => $healthRecords->lastPage()
            ]
        ], 200, [
            'X-HIPAA-Compliance' => 'enforced',
            'Cache-Control' => 'private, no-cache, no-store, must-revalidate'
        ]);
    }

    /**
     * Display a specific health record with PHI protection.
     *
     * @param HealthRecord $healthRecord
     * @return JsonResponse
     */
    public function show(HealthRecord $healthRecord): JsonResponse
    {
        // Verify authorization
        $this->authorize('view', $healthRecord);

        // Log PHI access for HIPAA compliance
        Log::channel('hipaa-audit')->info('Health record accessed', [
            'health_record_id' => $healthRecord->id,
            'user_id' => Auth::id(),
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent()
        ]);

        return response()->json(
            new HealthRecordResource($healthRecord),
            200,
            [
                'X-HIPAA-Compliance' => 'enforced',
                'Cache-Control' => 'private, no-cache, no-store, must-revalidate'
            ]
        );
    }

    /**
     * Store a new health record with encryption and audit trail.
     *
     * @param Request $request
     * @return JsonResponse
     */
    public function store(Request $request): JsonResponse
    {
        // Verify enrollment ownership or admin access
        $this->authorize('create', HealthRecord::class);

        // Validate request data
        $validatedData = $request->validate([
            'enrollment_id' => 'required|uuid|exists:enrollments,id',
            'health_data' => 'required|array'
        ]);

        // Create health record with encrypted data
        $healthRecord = new HealthRecord();
        $healthRecord->enrollment_id = $validatedData['enrollment_id'];
        $healthRecord->setHealthData($validatedData['health_data']);

        // Log creation for HIPAA audit
        Log::channel('hipaa-audit')->info('Health record created', [
            'health_record_id' => $healthRecord->id,
            'enrollment_id' => $healthRecord->enrollment_id,
            'user_id' => Auth::id(),
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent()
        ]);

        return response()->json(
            new HealthRecordResource($healthRecord),
            201,
            [
                'X-HIPAA-Compliance' => 'enforced',
                'Location' => "/api/v1/health-records/{$healthRecord->id}"
            ]
        );
    }

    /**
     * Update health record with encryption and comprehensive audit logging.
     *
     * @param UpdateHealthRecordRequest $request
     * @param HealthRecord $healthRecord
     * @return JsonResponse
     */
    public function update(UpdateHealthRecordRequest $request, HealthRecord $healthRecord): JsonResponse
    {
        // Request validation handled by UpdateHealthRecordRequest

        // Update health record with encrypted data
        $healthRecord->setHealthData($request->validated());

        // Log update for HIPAA compliance
        Log::channel('hipaa-audit')->info('Health record updated', [
            'health_record_id' => $healthRecord->id,
            'user_id' => Auth::id(),
            'fields_updated' => array_keys($request->validated()),
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent()
        ]);

        return response()->json(
            new HealthRecordResource($healthRecord),
            200,
            ['X-HIPAA-Compliance' => 'enforced']
        );
    }

    /**
     * Verify health record with staff authorization and audit trail.
     *
     * @param HealthRecord $healthRecord
     * @return JsonResponse
     */
    public function verify(HealthRecord $healthRecord): JsonResponse
    {
        // Verify staff authorization
        $this->authorize('verify', $healthRecord);

        // Mark record as verified
        $healthRecord->markAsVerified();

        // Log verification for HIPAA compliance
        Log::channel('hipaa-audit')->info('Health record verified', [
            'health_record_id' => $healthRecord->id,
            'verifier_id' => Auth::id(),
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent()
        ]);

        return response()->json(
            new HealthRecordResource($healthRecord),
            200,
            ['X-HIPAA-Compliance' => 'enforced']
        );
    }

    /**
     * Soft delete health record with comprehensive audit trail.
     *
     * @param HealthRecord $healthRecord
     * @return JsonResponse
     */
    public function destroy(HealthRecord $healthRecord): JsonResponse
    {
        // Verify deletion authorization
        $this->authorize('delete', $healthRecord);

        // Log deletion request for HIPAA compliance
        Log::channel('hipaa-audit')->info('Health record deleted', [
            'health_record_id' => $healthRecord->id,
            'user_id' => Auth::id(),
            'ip_address' => request()->ip(),
            'user_agent' => request()->userAgent()
        ]);

        // Soft delete the record
        $healthRecord->delete();

        return response()->json(null, 204, [
            'X-HIPAA-Compliance' => 'enforced'
        ]);
    }
}