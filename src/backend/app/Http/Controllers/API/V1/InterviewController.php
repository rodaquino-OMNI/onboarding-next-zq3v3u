<?php

namespace App\Http\Controllers\API\V1;

use App\Http\Controllers\Controller;
use App\Models\Interview;
use App\Http\Resources\API\V1\InterviewResource;
use App\Services\Video\VonageService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;
use Monolog\Logger as AuditLogger;
use Carbon\Carbon;

/**
 * InterviewController - Handles medical interview management with HIPAA compliance
 * and regional optimization.
 *
 * @package App\Http\Controllers\API\V1
 * @version 1.0.0
 */
class InterviewController extends Controller
{
    /**
     * @var VonageService Video service instance
     */
    protected VonageService $videoService;

    /**
     * @var AuditLogger HIPAA-compliant audit logger
     */
    protected AuditLogger $auditLogger;

    /**
     * @var \Illuminate\Support\Facades\Cache Cache instance
     */
    protected $cache;

    /**
     * Cache TTL for interview data in seconds
     */
    private const CACHE_TTL = 300; // 5 minutes

    /**
     * Initialize controller with required services
     *
     * @param VonageService $videoService
     * @param AuditLogger $auditLogger
     * @param \Illuminate\Support\Facades\Cache $cache
     */
    public function __construct(
        VonageService $videoService,
        AuditLogger $auditLogger,
        Cache $cache
    ) {
        $this->videoService = $videoService;
        $this->auditLogger = $auditLogger;
        $this->cache = $cache;

        $this->middleware('auth:sanctum');
        $this->middleware('throttle:60,1');
        $this->middleware('hipaa.audit');
    }

    /**
     * List interviews with filtering and pagination
     *
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function index(Request $request)
    {
        // Validate request parameters
        $request->validate([
            'status' => 'sometimes|string|in:scheduled,in_progress,completed,cancelled,rescheduled,failed',
            'date_from' => 'sometimes|date',
            'date_to' => 'sometimes|date|after:date_from',
            'interviewer_id' => 'sometimes|uuid|exists:users,id',
            'per_page' => 'sometimes|integer|min:10|max:100'
        ]);

        // Generate cache key based on request parameters
        $cacheKey = sprintf(
            'interviews:%s:%s',
            $request->user()->id,
            md5(json_encode($request->all()))
        );

        // Try to get from cache first
        if ($this->cache->has($cacheKey)) {
            return response()->json(
                $this->cache->get($cacheKey),
                Response::HTTP_OK
            );
        }

        // Build base query
        $query = Interview::query()
            ->with(['enrollment', 'interviewer'])
            ->when($request->status, function ($q) use ($request) {
                return $q->where('status', $request->status);
            })
            ->when($request->date_from, function ($q) use ($request) {
                return $q->where('scheduled_at', '>=', Carbon::parse($request->date_from));
            })
            ->when($request->date_to, function ($q) use ($request) {
                return $q->where('scheduled_at', '<=', Carbon::parse($request->date_to));
            })
            ->when($request->interviewer_id, function ($q) use ($request) {
                return $q->where('interviewer_id', $request->interviewer_id);
            });

        // Apply role-based filters
        if ($request->user()->role === 'interviewer') {
            $query->where('interviewer_id', $request->user()->id);
        } elseif ($request->user()->role === 'individual') {
            $query->whereHas('enrollment', function ($q) use ($request) {
                $q->where('user_id', $request->user()->id);
            });
        }

        // Paginate results
        $interviews = $query->orderBy('scheduled_at', 'desc')
            ->paginate($request->per_page ?? 15);

        // Transform using resource
        $response = InterviewResource::collection($interviews)
            ->additional([
                'meta' => [
                    'total' => $interviews->total(),
                    'per_page' => $interviews->perPage(),
                    'current_page' => $interviews->currentPage(),
                    'last_page' => $interviews->lastPage(),
                    'generated_at' => Carbon::now()->toIso8601String()
                ]
            ]);

        // Cache the response
        $this->cache->put($cacheKey, $response, self::CACHE_TTL);

        // Log access for HIPAA compliance
        $this->auditLogger->info('Interviews listed', [
            'user_id' => $request->user()->id,
            'role' => $request->user()->role,
            'filters' => $request->all(),
            'results_count' => $interviews->count(),
            'ip_address' => $request->ip()
        ]);

        return response()->json($response, Response::HTTP_OK);
    }

    /**
     * Schedule a new interview
     *
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function store(Request $request)
    {
        $request->validate([
            'enrollment_id' => 'required|uuid|exists:enrollments,id',
            'interviewer_id' => 'required|uuid|exists:users,id',
            'scheduled_at' => 'required|date|after:now',
            'duration_minutes' => 'required|integer|min:15|max:120'
        ]);

        // Create interview record
        $interview = Interview::create([
            'enrollment_id' => $request->enrollment_id,
            'interviewer_id' => $request->interviewer_id,
            'scheduled_at' => Carbon::parse($request->scheduled_at),
            'duration_minutes' => $request->duration_minutes,
            'status' => 'scheduled'
        ]);

        // Generate video session with regional optimization
        $sessionData = $this->videoService->createSession([
            'interview_id' => $interview->id,
            'scheduled_at' => $interview->scheduled_at,
            'duration' => $interview->duration_minutes,
            'location' => $request->header('CF-IPCountry', 'BR')
        ]);

        $interview->video_session_id = $sessionData['sessionId'];
        $interview->save();

        // Clear related caches
        $this->cache->tags(['interviews'])->flush();

        // Log creation for HIPAA compliance
        $this->auditLogger->info('Interview scheduled', [
            'interview_id' => $interview->id,
            'enrollment_id' => $interview->enrollment_id,
            'interviewer_id' => $interview->interviewer_id,
            'scheduled_at' => $interview->scheduled_at,
            'user_id' => $request->user()->id,
            'ip_address' => $request->ip()
        ]);

        return response()->json(
            new InterviewResource($interview),
            Response::HTTP_CREATED
        );
    }

    /**
     * Get interview details
     *
     * @param Request $request
     * @param string $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function show(Request $request, string $id)
    {
        $interview = Interview::with(['enrollment', 'interviewer'])
            ->findOrFail($id);

        // Check authorization
        $this->authorize('view', $interview);

        // Get from cache if available
        $cacheKey = "interview:{$id}";
        if ($this->cache->has($cacheKey)) {
            return response()->json(
                $this->cache->get($cacheKey),
                Response::HTTP_OK
            );
        }

        $response = new InterviewResource($interview);

        // Cache response
        $this->cache->put($cacheKey, $response, self::CACHE_TTL);

        // Log access for HIPAA compliance
        $this->auditLogger->info('Interview accessed', [
            'interview_id' => $id,
            'user_id' => $request->user()->id,
            'role' => $request->user()->role,
            'ip_address' => $request->ip()
        ]);

        return response()->json($response, Response::HTTP_OK);
    }

    /**
     * Update interview status
     *
     * @param Request $request
     * @param string $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function updateStatus(Request $request, string $id)
    {
        $request->validate([
            'status' => 'required|string|in:in_progress,completed,cancelled,rescheduled,failed'
        ]);

        $interview = Interview::findOrFail($id);

        // Check authorization
        $this->authorize('update', $interview);

        // Update status
        $interview->updateStatus($request->status);

        // Handle video session if needed
        if ($request->status === 'completed' || $request->status === 'cancelled') {
            $this->videoService->endSession($interview->video_session_id);
        }

        // Clear related caches
        $this->cache->tags(['interviews'])->flush();

        return response()->json(
            new InterviewResource($interview),
            Response::HTTP_OK
        );
    }

    /**
     * Update interview notes
     *
     * @param Request $request
     * @param string $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function updateNotes(Request $request, string $id)
    {
        $request->validate([
            'notes' => 'required|array'
        ]);

        $interview = Interview::findOrFail($id);

        // Check authorization
        $this->authorize('update', $interview);

        // Update notes
        $interview->updateNotes($request->notes);

        // Clear related caches
        $this->cache->forget("interview:{$id}");

        return response()->json(
            new InterviewResource($interview),
            Response::HTTP_OK
        );
    }

    /**
     * Generate video session token
     *
     * @param Request $request
     * @param string $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function generateVideoToken(Request $request, string $id)
    {
        $interview = Interview::findOrFail($id);

        // Check authorization
        $this->authorize('join', $interview);

        // Generate token with role-based permissions
        $tokenData = $this->videoService->generateToken(
            $interview->video_session_id,
            $request->user()->role === 'interviewer' ? 'interviewer' : 'interviewee',
            [
                'user_id' => $request->user()->id,
                'name' => $request->user()->name
            ]
        );

        return response()->json([
            'token' => $tokenData['token'],
            'expires_at' => Carbon::createFromTimestamp($tokenData['expiresAt'])->toIso8601String(),
            'permissions' => $tokenData['permissions']
        ], Response::HTTP_OK);
    }
}