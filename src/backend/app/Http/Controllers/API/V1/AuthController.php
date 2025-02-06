<?php

namespace App\Http\Controllers\API\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Cache\RateLimiter;
use Illuminate\Support\Facades\Lang;
use Laravel\Sanctum\PersonalAccessToken;
use Illuminate\Validation\ValidationException;
use Illuminate\Auth\AuthenticationException;
use Symfony\Component\HttpKernel\Exception\TooManyRequestsException;

/**
 * Enhanced Authentication Controller
 * 
 * Handles user authentication with security features including:
 * - JWT-based authentication via Laravel Sanctum
 * - IP-based rate limiting
 * - Multi-language support
 * - Comprehensive security logging
 * - GDPR/LGPD consent tracking
 *
 * @package App\Http\Controllers\API\V1
 */
class AuthController extends Controller
{
    /**
     * @var \Laravel\Security\SecurityLog
     */
    protected $securityLog;

    /**
     * @var \Illuminate\Cache\RateLimiter
     */
    protected $limiter;

    /**
     * Token expiration time in minutes
     */
    const TOKEN_EXPIRY = 60;

    /**
     * AuthController constructor.
     *
     * @param \Laravel\Security\SecurityLog $securityLog
     * @param \Illuminate\Cache\RateLimiter $limiter
     */
    public function __construct($securityLog, RateLimiter $limiter)
    {
        $this->securityLog = $securityLog;
        $this->limiter = $limiter;
        
        $this->middleware('guest')->except(['logout']);
        $this->middleware('localize');
    }

    /**
     * Authenticate user and issue token
     *
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     * @throws AuthenticationException
     * @throws TooManyRequestsException
     */
    public function login(Request $request)
    {
        // Check rate limiting
        if ($this->limiter->tooManyAttempts($request->ip(), 6)) {
            $this->securityLog->warning('Rate limit exceeded', [
                'ip' => $request->ip(),
                'attempts' => $this->limiter->attempts($request->ip())
            ]);
            
            throw new TooManyRequestsException(
                Lang::get('auth.throttle'),
                null,
                ['retry-after' => $this->limiter->availableIn($request->ip())]
            );
        }

        // Validate login request
        $credentials = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
            'device_name' => 'required|string',
            'device_fingerprint' => 'required|string'
        ]);

        // Attempt authentication
        if (!auth()->attempt([
            'email' => $credentials['email'],
            'password' => $credentials['password']
        ])) {
            $user = User::where('email', $credentials['email'])->first();
            
            if ($user) {
                $user->recordLoginAttempt(false, $request->ip());
            }

            $this->limiter->hit($request->ip());
            
            throw new AuthenticationException(Lang::get('auth.failed'));
        }

        $user = auth()->user();

        // Verify account is not locked
        if ($user->is_locked) {
            $this->securityLog->alert('Login attempt on locked account', [
                'user_id' => $user->id,
                'ip' => $request->ip()
            ]);
            
            throw new AuthenticationException(Lang::get('auth.locked'));
        }

        // Record successful login
        $user->recordLoginAttempt(true, $request->ip());

        // Revoke existing tokens for device
        $user->tokens()
            ->where('name', $credentials['device_name'])
            ->delete();

        // Create new token
        $token = $user->createToken($credentials['device_name'], [], now()->addMinutes(self::TOKEN_EXPIRY));

        $this->securityLog->info('Successful login', [
            'user_id' => $user->id,
            'ip' => $request->ip(),
            'device' => $credentials['device_name']
        ]);

        return response()->json([
            'status' => 'success',
            'message' => Lang::get('auth.success'),
            'data' => [
                'token' => $token->plainTextToken,
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $user->role,
                    'language' => $user->language
                ]
            ]
        ]);
    }

    /**
     * Register new user with consent tracking
     *
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     * @throws ValidationException
     */
    public function register(Request $request)
    {
        // Validate registration data
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users',
            'password' => 'required|string|min:8|confirmed',
            'role' => 'required|string|in:' . implode(',', User::USER_ROLES),
            'language' => 'required|string|in:' . implode(',', User::LANGUAGES),
            'device_name' => 'required|string',
            'consent' => 'required|array',
            'consent.data_processing' => 'required|boolean',
            'consent.terms_of_service' => 'required|boolean'
        ]);

        // Verify required consents
        if (!$data['consent']['data_processing'] || !$data['consent']['terms_of_service']) {
            throw ValidationException::withMessages([
                'consent' => Lang::get('auth.consent_required')
            ]);
        }

        // Create user
        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => bcrypt($data['password']),
            'role' => $data['role'],
            'language' => $data['language'],
            'preferences' => [
                'language' => $data['language'],
                'notifications' => true
            ]
        ]);

        // Log consents
        foreach ($data['consent'] as $type => $accepted) {
            if ($accepted) {
                $user->logConsent($type, [
                    'version' => config("consent.versions.$type"),
                    'accepted' => true
                ]);
            }
        }

        // Create initial token
        $token = $user->createToken($data['device_name'], [], now()->addMinutes(self::TOKEN_EXPIRY));

        $this->securityLog->info('User registered', [
            'user_id' => $user->id,
            'ip' => $request->ip(),
            'role' => $user->role
        ]);

        return response()->json([
            'status' => 'success',
            'message' => Lang::get('auth.registered'),
            'data' => [
                'token' => $token->plainTextToken,
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $user->role,
                    'language' => $user->language
                ]
            ]
        ], Response::HTTP_CREATED);
    }

    /**
     * Logout user and revoke tokens
     *
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function logout(Request $request)
    {
        $user = $request->user();
        
        // Get current token
        $currentToken = $request->bearerToken();
        
        // Revoke all tokens
        if ($request->get('all_devices', false)) {
            $user->tokens()->delete();
        } else {
            // Revoke only current token
            $user->tokens()
                ->where('token', hash('sha256', $currentToken))
                ->delete();
        }

        $this->securityLog->info('User logged out', [
            'user_id' => $user->id,
            'ip' => $request->ip(),
            'all_devices' => $request->get('all_devices', false)
        ]);

        return response()->json([
            'status' => 'success',
            'message' => Lang::get('auth.logout')
        ]);
    }
}