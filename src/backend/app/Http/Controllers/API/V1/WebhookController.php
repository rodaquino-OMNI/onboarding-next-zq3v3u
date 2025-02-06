<?php

namespace App\Http\Controllers\API\V1;

use App\Http\Controllers\Controller;
use App\Services\Webhook\WebhookService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Foundation\Http\FormRequest;

/**
 * WebhookController
 * 
 * Enhanced REST API controller for managing webhook subscriptions with comprehensive
 * security, monitoring, and compliance features in the AUSTA Integration Platform.
 *
 * @package App\Http\Controllers\API\V1
 * @version 1.0.0
 */
class WebhookController extends Controller
{
    /**
     * The webhook service instance.
     *
     * @var WebhookService
     */
    protected WebhookService $webhookService;

    /**
     * Request tracking ID.
     *
     * @var string
     */
    protected string $requestId;

    /**
     * Create a new WebhookController instance.
     *
     * @param WebhookService $webhookService
     */
    public function __construct(WebhookService $webhookService)
    {
        $this->webhookService = $webhookService;
        $this->requestId = Str::uuid()->toString();
        
        // Apply rate limiting middleware
        $this->middleware('throttle:100,1')->only(['register', 'update', 'delete']);
        $this->middleware('throttle:300,1')->only(['deliveryStatus']);
    }

    /**
     * Register a new webhook subscription.
     *
     * @param Request $request
     * @return JsonResponse
     */
    public function register(Request $request): JsonResponse
    {
        $operationId = Str::uuid()->toString();

        Log::info('Webhook registration initiated', [
            'request_id' => $this->requestId,
            'operation_id' => $operationId,
            'client_ip' => $request->ip()
        ]);

        try {
            $validated = $request->validate([
                'url' => 'required|url|regex:/^https:\/\//i',
                'events' => 'required|array|min:1',
                'events.*' => 'string|in:enrollment.created,enrollment.updated,enrollment.completed,document.uploaded,document.processed,interview.scheduled,interview.completed',
                'secret' => 'nullable|string|min:32',
                'config' => 'nullable|array'
            ]);

            $result = $this->webhookService->registerWebhook(
                $validated['url'],
                $validated['events'],
                $validated['secret'] ?? null,
                $validated['config'] ?? []
            );

            Log::info('Webhook registered successfully', [
                'request_id' => $this->requestId,
                'operation_id' => $operationId,
                'webhook_id' => $result['webhook_id']
            ]);

            return response()->json([
                'status' => 'success',
                'data' => $result,
                'meta' => [
                    'request_id' => $this->requestId,
                    'operation_id' => $operationId
                ]
            ], Response::HTTP_CREATED)
            ->header('X-RateLimit-Type', 'webhook_registration');
        } catch (\Exception $e) {
            Log::error('Webhook registration failed', [
                'request_id' => $this->requestId,
                'operation_id' => $operationId,
                'error' => $e->getMessage()
            ]);

            return response()->json([
                'status' => 'error',
                'error' => 'Registration failed',
                'message' => $e->getMessage(),
                'meta' => [
                    'request_id' => $this->requestId,
                    'operation_id' => $operationId
                ]
            ], Response::HTTP_BAD_REQUEST);
        }
    }

    /**
     * Update an existing webhook subscription.
     *
     * @param Request $request
     * @param string $id
     * @return JsonResponse
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $operationId = Str::uuid()->toString();

        Log::info('Webhook update initiated', [
            'request_id' => $this->requestId,
            'operation_id' => $operationId,
            'webhook_id' => $id
        ]);

        try {
            $validated = $request->validate([
                'url' => 'nullable|url|regex:/^https:\/\//i',
                'events' => 'nullable|array|min:1',
                'events.*' => 'string|in:enrollment.created,enrollment.updated,enrollment.completed,document.uploaded,document.processed,interview.scheduled,interview.completed',
                'config' => 'nullable|array'
            ]);

            $result = $this->webhookService->updateWebhook($id, $validated);

            Log::info('Webhook updated successfully', [
                'request_id' => $this->requestId,
                'operation_id' => $operationId,
                'webhook_id' => $id
            ]);

            return response()->json([
                'status' => 'success',
                'data' => $result,
                'meta' => [
                    'request_id' => $this->requestId,
                    'operation_id' => $operationId
                ]
            ]);
        } catch (\Exception $e) {
            Log::error('Webhook update failed', [
                'request_id' => $this->requestId,
                'operation_id' => $operationId,
                'webhook_id' => $id,
                'error' => $e->getMessage()
            ]);

            return response()->json([
                'status' => 'error',
                'error' => 'Update failed',
                'message' => $e->getMessage(),
                'meta' => [
                    'request_id' => $this->requestId,
                    'operation_id' => $operationId
                ]
            ], Response::HTTP_BAD_REQUEST);
        }
    }

    /**
     * Delete a webhook subscription.
     *
     * @param string $id
     * @return JsonResponse
     */
    public function delete(string $id): JsonResponse
    {
        $operationId = Str::uuid()->toString();

        Log::info('Webhook deletion initiated', [
            'request_id' => $this->requestId,
            'operation_id' => $operationId,
            'webhook_id' => $id
        ]);

        try {
            $result = $this->webhookService->deleteWebhook($id);

            Log::info('Webhook deleted successfully', [
                'request_id' => $this->requestId,
                'operation_id' => $operationId,
                'webhook_id' => $id
            ]);

            return response()->json([
                'status' => 'success',
                'data' => $result,
                'meta' => [
                    'request_id' => $this->requestId,
                    'operation_id' => $operationId
                ]
            ]);
        } catch (\Exception $e) {
            Log::error('Webhook deletion failed', [
                'request_id' => $this->requestId,
                'operation_id' => $operationId,
                'webhook_id' => $id,
                'error' => $e->getMessage()
            ]);

            return response()->json([
                'status' => 'error',
                'error' => 'Deletion failed',
                'message' => $e->getMessage(),
                'meta' => [
                    'request_id' => $this->requestId,
                    'operation_id' => $operationId
                ]
            ], Response::HTTP_BAD_REQUEST);
        }
    }

    /**
     * Get webhook delivery status and health metrics.
     *
     * @param string $webhookId
     * @return JsonResponse
     */
    public function deliveryStatus(string $webhookId): JsonResponse
    {
        $operationId = Str::uuid()->toString();

        Log::info('Webhook status check initiated', [
            'request_id' => $this->requestId,
            'operation_id' => $operationId,
            'webhook_id' => $webhookId
        ]);

        try {
            $status = $this->webhookService->getDeliveryStatus($webhookId);
            $health = $this->webhookService->checkHealth($webhookId);

            Log::info('Webhook status retrieved successfully', [
                'request_id' => $this->requestId,
                'operation_id' => $operationId,
                'webhook_id' => $webhookId,
                'health_score' => $health['health_score']
            ]);

            return response()->json([
                'status' => 'success',
                'data' => [
                    'delivery_status' => $status,
                    'health_metrics' => $health
                ],
                'meta' => [
                    'request_id' => $this->requestId,
                    'operation_id' => $operationId
                ]
            ]);
        } catch (\Exception $e) {
            Log::error('Webhook status check failed', [
                'request_id' => $this->requestId,
                'operation_id' => $operationId,
                'webhook_id' => $webhookId,
                'error' => $e->getMessage()
            ]);

            return response()->json([
                'status' => 'error',
                'error' => 'Status check failed',
                'message' => $e->getMessage(),
                'meta' => [
                    'request_id' => $this->requestId,
                    'operation_id' => $operationId
                ]
            ], Response::HTTP_BAD_REQUEST);
        }
    }

    /**
     * Rotate webhook secret key.
     *
     * @param string $webhookId
     * @return JsonResponse
     */
    public function rotateSecret(string $webhookId): JsonResponse
    {
        $operationId = Str::uuid()->toString();

        Log::info('Webhook secret rotation initiated', [
            'request_id' => $this->requestId,
            'operation_id' => $operationId,
            'webhook_id' => $webhookId
        ]);

        try {
            $result = $this->webhookService->rotateSecret($webhookId);

            Log::info('Webhook secret rotated successfully', [
                'request_id' => $this->requestId,
                'operation_id' => $operationId,
                'webhook_id' => $webhookId
            ]);

            return response()->json([
                'status' => 'success',
                'data' => [
                    'webhook_id' => $webhookId,
                    'new_secret' => $result['secret']
                ],
                'meta' => [
                    'request_id' => $this->requestId,
                    'operation_id' => $operationId
                ]
            ]);
        } catch (\Exception $e) {
            Log::error('Webhook secret rotation failed', [
                'request_id' => $this->requestId,
                'operation_id' => $operationId,
                'webhook_id' => $webhookId,
                'error' => $e->getMessage()
            ]);

            return response()->json([
                'status' => 'error',
                'error' => 'Secret rotation failed',
                'message' => $e->getMessage(),
                'meta' => [
                    'request_id' => $this->requestId,
                    'operation_id' => $operationId
                ]
            ], Response::HTTP_BAD_REQUEST);
        }
    }
}