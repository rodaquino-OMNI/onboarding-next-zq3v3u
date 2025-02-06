<?php

use Illuminate\Support\Facades\Route; // ^9.0
use App\Http\Controllers\API\V1\AuthController;
use App\Http\Controllers\API\V1\EnrollmentController;
use App\Http\Controllers\API\V1\WebhookController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Production-ready API routes for the AUSTA Integration Platform with
| comprehensive security middleware, rate limiting, and versioning.
|
*/

// API Version Prefix
const API_VERSION = 'v1';
const API_PREFIX = 'api/' . API_VERSION;

// Rate Limiting Configuration
const PUBLIC_RATE_LIMIT = '60,1';  // 60 requests per minute for public routes
const AUTH_RATE_LIMIT = '1000,1';  // 1000 requests per minute for authenticated routes

/*
|--------------------------------------------------------------------------
| Public Routes
|--------------------------------------------------------------------------
*/
Route::prefix(API_PREFIX)->group(function () {
    // Apply security middleware to all routes
    Route::middleware([
        'throttle:' . PUBLIC_RATE_LIMIT,
        'security.headers',
        'cors'
    ])->group(function () {
        // Health Check
        Route::get('/health', function () {
            return response()->json([
                'status' => 'healthy',
                'timestamp' => now()->toIso8601String(),
                'version' => API_VERSION
            ]);
        })->name('health');

        // Authentication Routes
        Route::prefix('auth')->group(function () {
            Route::post('/login', [AuthController::class, 'login'])
                ->middleware(['throttle:6,1'])
                ->name('auth.login');

            Route::post('/register', [AuthController::class, 'register'])
                ->middleware(['throttle:3,1'])
                ->name('auth.register');

            Route::post('/verify-mfa', [AuthController::class, 'verifyMfa'])
                ->middleware(['throttle:5,1'])
                ->name('auth.verify-mfa');
        });

        // Webhook Public Routes
        Route::prefix('webhooks')->group(function () {
            Route::post('/', [WebhookController::class, 'handleWebhook'])
                ->middleware(['webhook.signature'])
                ->name('webhooks.handle');
        });
    });
});

/*
|--------------------------------------------------------------------------
| Protected Routes
|--------------------------------------------------------------------------
*/
Route::prefix(API_PREFIX)->middleware([
    'auth:sanctum',
    'throttle:' . AUTH_RATE_LIMIT,
    'security.headers',
    'verified'
])->group(function () {
    // Protected Authentication Routes
    Route::prefix('auth')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout'])
            ->name('auth.logout');

        Route::post('/refresh', [AuthController::class, 'refresh'])
            ->name('auth.refresh');

        Route::get('/me', [AuthController::class, 'me'])
            ->name('auth.me');

        Route::post('/enable-mfa', [AuthController::class, 'enableMfa'])
            ->middleware(['password.confirm'])
            ->name('auth.enable-mfa');
    });

    // Enrollment Management Routes
    Route::prefix('enrollments')->group(function () {
        Route::get('/', [EnrollmentController::class, 'index'])
            ->middleware(['cache.headers:public;max_age=60;etag'])
            ->name('enrollments.index');

        Route::post('/', [EnrollmentController::class, 'store'])
            ->middleware(['hipaa.audit'])
            ->name('enrollments.store');

        Route::get('/{enrollment}', [EnrollmentController::class, 'show'])
            ->middleware(['can:view,enrollment', 'cache.headers:private;max_age=60;etag'])
            ->name('enrollments.show');

        Route::put('/{enrollment}', [EnrollmentController::class, 'update'])
            ->middleware(['can:update,enrollment', 'hipaa.audit'])
            ->name('enrollments.update');

        Route::delete('/{enrollment}', [EnrollmentController::class, 'destroy'])
            ->middleware(['can:delete,enrollment', 'hipaa.audit'])
            ->name('enrollments.destroy');

        Route::post('/{enrollment}/status', [EnrollmentController::class, 'updateStatus'])
            ->middleware(['can:update,enrollment', 'hipaa.audit'])
            ->name('enrollments.status.update');

        Route::post('/{enrollment}/documents', [EnrollmentController::class, 'uploadDocuments'])
            ->middleware(['can:update,enrollment', 'hipaa.audit'])
            ->name('enrollments.documents.upload');

        Route::post('/{enrollment}/interview', [EnrollmentController::class, 'scheduleInterview'])
            ->middleware(['can:update,enrollment', 'hipaa.audit'])
            ->name('enrollments.interview.schedule');
    });

    // Webhook Management Routes
    Route::prefix('webhooks')->middleware(['role:admin'])->group(function () {
        Route::post('/register', [WebhookController::class, 'register'])
            ->name('webhooks.register');

        Route::put('/{webhook}', [WebhookController::class, 'update'])
            ->name('webhooks.update');

        Route::delete('/{webhook}', [WebhookController::class, 'delete'])
            ->name('webhooks.delete');

        Route::get('/{webhook}/status', [WebhookController::class, 'deliveryStatus'])
            ->name('webhooks.status');

        Route::post('/{webhook}/rotate-secret', [WebhookController::class, 'rotateSecret'])
            ->name('webhooks.rotate-secret');
    });
});

/*
|--------------------------------------------------------------------------
| Error Handling
|--------------------------------------------------------------------------
*/
Route::fallback(function () {
    return response()->json([
        'status' => 'error',
        'message' => 'Route not found',
        'code' => 'NOT_FOUND'
    ], 404);
});