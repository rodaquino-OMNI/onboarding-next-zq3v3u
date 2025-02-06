<?php

namespace App\Http\Controllers\API\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Http\Resources\API\V1\UserResource;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash; // ^9.0
use Illuminate\Support\Facades\RateLimiter; // ^9.0
use Illuminate\Support\Facades\Log as AuditLogger; // ^9.0
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

/**
 * API Controller for User Management Operations
 *
 * Handles user-related operations with HIPAA/GDPR/LGPD compliance,
 * role-based access control, and multi-language support.
 *
 * @package App\Http\Controllers\API\V1
 */
class UserController extends Controller
{
    /**
     * @var \Illuminate\Support\Facades\Log
     */
    protected $auditLogger;

    /**
     * Maximum number of requests per minute for rate limiting
     */
    private const RATE_LIMIT_PER_MINUTE = 100;

    /**
     * UserController constructor.
     *
     * @param \Illuminate\Support\Facades\Log $auditLogger
     */
    public function __construct(AuditLogger $auditLogger)
    {
        parent::__construct();
        $this->auditLogger = $auditLogger;

        $this->middleware('auth:sanctum');
        $this->middleware('throttle:' . self::RATE_LIMIT_PER_MINUTE . ',1');
        $this->middleware('cors');
    }

    /**
     * List users with role-based filtering and pagination
     *
     * @param Request $request
     * @return JsonResponse
     * @throws ValidationException
     */
    public function index(Request $request): JsonResponse
    {
        try {
            // Validate request parameters
            $validated = $request->validate([
                'page' => 'nullable|integer|min:1',
                'per_page' => 'nullable|integer|min:10|max:100',
                'role' => 'nullable|string|in:' . implode(',', User::USER_ROLES),
                'search' => 'nullable|string|max:255',
                'sort' => 'nullable|string|in:name,email,created_at',
                'direction' => 'nullable|string|in:asc,desc'
            ]);

            // Check role-based access
            if (!$request->user()->hasRole('admin')) {
                $this->auditLogger->warning('Unauthorized user list attempt', [
                    'user_id' => $request->user()->id,
                    'ip' => $request->ip()
                ]);
                return response()->json(['error' => 'Unauthorized access'], Response::HTTP_FORBIDDEN);
            }

            // Build query with filters
            $query = User::query();

            if ($request->filled('role')) {
                $query->where('role', $request->input('role'));
            }

            if ($request->filled('search')) {
                $query->where(function ($q) use ($request) {
                    $q->where('name', 'like', '%' . $request->input('search') . '%')
                      ->orWhere('email', 'like', '%' . $request->input('search') . '%');
                });
            }

            // Apply sorting
            $sort = $request->input('sort', 'created_at');
            $direction = $request->input('direction', 'desc');
            $query->orderBy($sort, $direction);

            // Apply pagination
            $perPage = $request->input('per_page', 15);
            $users = $query->paginate($perPage);

            // Transform data using resource
            $response = UserResource::collection($users);

            // Log successful access
            $this->auditLogger->info('User list accessed', [
                'admin_id' => $request->user()->id,
                'filters' => $validated,
                'ip' => $request->ip()
            ]);

            // Return response with security headers
            return response()->json($response)
                ->header('X-Content-Type-Options', 'nosniff')
                ->header('X-Frame-Options', 'DENY')
                ->header('X-XSS-Protection', '1; mode=block');

        } catch (ValidationException $e) {
            $this->auditLogger->error('User list validation failed', [
                'user_id' => $request->user()->id,
                'errors' => $e->errors(),
                'ip' => $request->ip()
            ]);
            throw $e;
        } catch (\Exception $e) {
            $this->auditLogger->error('User list error', [
                'user_id' => $request->user()->id,
                'error' => $e->getMessage(),
                'ip' => $request->ip()
            ]);
            return response()->json(['error' => 'Internal server error'], Response::HTTP_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Update user preferences including language and notifications
     *
     * @param Request $request
     * @param string $id
     * @return JsonResponse
     * @throws ValidationException
     */
    public function updatePreferences(Request $request, string $id): JsonResponse
    {
        try {
            // Validate request
            $validated = $request->validate([
                'language' => 'nullable|string|in:' . implode(',', User::LANGUAGES),
                'notifications' => 'nullable|array',
                'notifications.*' => 'boolean',
                'timezone' => 'nullable|string|timezone',
                'accessibility' => 'nullable|array',
                'accessibility.*' => 'string'
            ]);

            // Find user and check authorization
            $user = User::findOrFail($id);
            
            if ($request->user()->id !== $user->id && !$request->user()->hasRole('admin')) {
                $this->auditLogger->warning('Unauthorized preference update attempt', [
                    'user_id' => $request->user()->id,
                    'target_user_id' => $id,
                    'ip' => $request->ip()
                ]);
                return response()->json(['error' => 'Unauthorized access'], Response::HTTP_FORBIDDEN);
            }

            // Update preferences
            foreach ($validated as $key => $value) {
                $user->setPreference($key, $value);
            }

            // Log preference update
            $this->auditLogger->info('User preferences updated', [
                'user_id' => $user->id,
                'updated_by' => $request->user()->id,
                'changes' => $validated,
                'ip' => $request->ip()
            ]);

            // Return updated user data
            return response()->json([
                'data' => new UserResource($user),
                'message' => 'Preferences updated successfully'
            ]);

        } catch (ValidationException $e) {
            $this->auditLogger->error('Preference update validation failed', [
                'user_id' => $request->user()->id,
                'target_user_id' => $id,
                'errors' => $e->errors(),
                'ip' => $request->ip()
            ]);
            throw $e;
        } catch (\Exception $e) {
            $this->auditLogger->error('Preference update error', [
                'user_id' => $request->user()->id,
                'target_user_id' => $id,
                'error' => $e->getMessage(),
                'ip' => $request->ip()
            ]);
            return response()->json(['error' => 'Internal server error'], Response::HTTP_INTERNAL_SERVER_ERROR);
        }
    }
}