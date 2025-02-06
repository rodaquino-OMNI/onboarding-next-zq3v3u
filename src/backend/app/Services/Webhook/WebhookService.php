<?php

namespace App\Services\Webhook;

use App\Jobs\SendWebhook;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Validator;

/**
 * WebhookService
 * 
 * Production-grade service for managing webhook subscriptions with comprehensive
 * security, monitoring, and reliability features in the AUSTA Integration Platform.
 *
 * @package App\Services\Webhook
 * @version 1.0.0
 */
class WebhookService
{
    /**
     * Maximum retry attempts for webhook delivery.
     */
    protected int $maxRetries = 3;

    /**
     * Retry delay in seconds.
     */
    protected int $retryDelay = 60;

    /**
     * Request timeout in seconds.
     */
    protected int $timeout = 30;

    /**
     * Supported webhook event types.
     */
    protected array $supportedEvents = [
        'enrollment.created',
        'enrollment.updated',
        'enrollment.completed',
        'document.uploaded',
        'document.processed',
        'interview.scheduled',
        'interview.completed'
    ];

    /**
     * Circuit breaker configuration.
     */
    protected array $circuitBreakerConfig = [
        'threshold' => 5,
        'timeout' => 300,
        'cache_key_prefix' => 'webhook_circuit_'
    ];

    /**
     * Rate limiting configuration.
     */
    protected array $rateLimitConfig = [
        'max_attempts' => 1000,
        'decay_minutes' => 60,
        'cache_key_prefix' => 'webhook_ratelimit_'
    ];

    /**
     * Security configuration.
     */
    protected array $securityConfig = [
        'required_ssl' => true,
        'signature_algorithm' => 'sha256',
        'signature_header' => 'X-Webhook-Signature',
        'ip_whitelist_enabled' => true
    ];

    /**
     * Metrics collector configuration.
     */
    protected array $metricsCollector = [
        'success_count' => 0,
        'failure_count' => 0,
        'latency_sum' => 0,
        'delivery_count' => 0
    ];

    /**
     * Create a new WebhookService instance.
     */
    public function __construct()
    {
        $this->loadConfiguration();
        $this->initializeMetrics();
    }

    /**
     * Register a new webhook subscription with enhanced security validation.
     *
     * @param string $url Webhook endpoint URL
     * @param array $events Subscribed events
     * @param string|null $secret Custom webhook secret
     * @param array $config Additional configuration
     * @return array Webhook registration details
     * @throws \InvalidArgumentException
     */
    public function registerWebhook(string $url, array $events, ?string $secret = null, array $config = []): array
    {
        $this->validateWebhookUrl($url);
        $this->validateEvents($events);

        $webhookId = Str::uuid()->toString();
        $webhookSecret = $secret ?? Str::random(32);
        $signingKey = Hash::make($webhookSecret);

        $webhook = [
            'id' => $webhookId,
            'url' => $url,
            'events' => $events,
            'signing_key' => $signingKey,
            'status' => 'active',
            'created_at' => now(),
            'config' => array_merge([
                'timeout' => $this->timeout,
                'max_retries' => $this->maxRetries,
                'ssl_verify' => $this->securityConfig['required_ssl'],
                'ip_whitelist' => $config['ip_whitelist'] ?? []
            ], $config)
        ];

        DB::table('webhook_subscriptions')->insert($webhook);

        Log::info('Webhook registered successfully', [
            'webhook_id' => $webhookId,
            'url' => $url,
            'events' => $events
        ]);

        return [
            'webhook_id' => $webhookId,
            'secret' => $webhookSecret,
            'supported_events' => $events
        ];
    }

    /**
     * Dispatch webhook event with circuit breaker and rate limiting.
     *
     * @param string $event Event type
     * @param array $payload Event payload
     * @param array $options Dispatch options
     * @return array Dispatch status
     * @throws \RuntimeException
     */
    public function dispatchEvent(string $event, array $payload, array $options = []): array
    {
        if (!in_array($event, $this->supportedEvents)) {
            throw new \InvalidArgumentException("Unsupported event type: {$event}");
        }

        $subscribers = $this->getEventSubscribers($event);
        $dispatchResults = [];

        foreach ($subscribers as $subscriber) {
            if (!$this->canDispatchToSubscriber($subscriber)) {
                continue;
            }

            if ($this->isCircuitBroken($subscriber['id'])) {
                Log::warning('Circuit breaker active for webhook', [
                    'webhook_id' => $subscriber['id'],
                    'event' => $event
                ]);
                continue;
            }

            if (!$this->checkRateLimit($subscriber['id'])) {
                Log::warning('Rate limit exceeded for webhook', [
                    'webhook_id' => $subscriber['id'],
                    'event' => $event
                ]);
                continue;
            }

            $deliveryId = Str::uuid()->toString();
            $enrichedPayload = $this->enrichEventPayload($payload, $deliveryId);

            SendWebhook::dispatch(
                $subscriber['url'],
                $event,
                $enrichedPayload,
                $subscriber['signing_key']
            )->onQueue('webhooks');

            $dispatchResults[] = [
                'webhook_id' => $subscriber['id'],
                'delivery_id' => $deliveryId,
                'status' => 'queued'
            ];

            $this->recordMetrics('dispatch', $subscriber['id']);
        }

        return [
            'event' => $event,
            'dispatch_count' => count($dispatchResults),
            'deliveries' => $dispatchResults
        ];
    }

    /**
     * Monitor webhook endpoint health and availability.
     *
     * @param string $webhookId Webhook ID
     * @return array Health status and metrics
     */
    public function monitorHealth(string $webhookId): array
    {
        $webhook = DB::table('webhook_subscriptions')
            ->where('id', $webhookId)
            ->first();

        if (!$webhook) {
            throw new \InvalidArgumentException("Webhook not found: {$webhookId}");
        }

        $healthScore = $this->calculateHealthScore($webhookId);
        $metrics = $this->getWebhookMetrics($webhookId);

        $status = [
            'webhook_id' => $webhookId,
            'health_score' => $healthScore,
            'status' => $healthScore > 0.8 ? 'healthy' : 'degraded',
            'last_checked' => now()->toIso8601String(),
            'metrics' => $metrics
        ];

        if ($healthScore < 0.5) {
            $this->triggerCircuitBreaker($webhookId);
            $status['circuit_breaker'] = 'open';
        }

        return $status;
    }

    /**
     * Validate webhook URL format and accessibility.
     *
     * @param string $url
     * @throws \InvalidArgumentException
     */
    protected function validateWebhookUrl(string $url): void
    {
        $validator = Validator::make(
            ['url' => $url],
            ['url' => 'required|url|regex:/^https:\/\//i']
        );

        if ($validator->fails()) {
            throw new \InvalidArgumentException(
                'Invalid webhook URL. HTTPS is required.'
            );
        }
    }

    /**
     * Validate subscribed events.
     *
     * @param array $events
     * @throws \InvalidArgumentException
     */
    protected function validateEvents(array $events): void
    {
        $invalidEvents = array_diff($events, $this->supportedEvents);
        if (!empty($invalidEvents)) {
            throw new \InvalidArgumentException(
                'Unsupported events: ' . implode(', ', $invalidEvents)
            );
        }
    }

    /**
     * Check if circuit breaker is active for webhook.
     *
     * @param string $webhookId
     * @return bool
     */
    protected function isCircuitBroken(string $webhookId): bool
    {
        $key = $this->circuitBreakerConfig['cache_key_prefix'] . $webhookId;
        return Cache::has($key);
    }

    /**
     * Trigger circuit breaker for webhook.
     *
     * @param string $webhookId
     */
    protected function triggerCircuitBreaker(string $webhookId): void
    {
        $key = $this->circuitBreakerConfig['cache_key_prefix'] . $webhookId;
        Cache::put($key, true, $this->circuitBreakerConfig['timeout']);

        Log::alert('Circuit breaker triggered for webhook', [
            'webhook_id' => $webhookId,
            'timeout' => $this->circuitBreakerConfig['timeout']
        ]);
    }

    /**
     * Check rate limit for webhook.
     *
     * @param string $webhookId
     * @return bool
     */
    protected function checkRateLimit(string $webhookId): bool
    {
        $key = $this->rateLimitConfig['cache_key_prefix'] . $webhookId;
        return Cache::add(
            $key,
            0,
            $this->rateLimitConfig['decay_minutes'] * 60
        );
    }

    /**
     * Calculate webhook health score.
     *
     * @param string $webhookId
     * @return float
     */
    protected function calculateHealthScore(string $webhookId): float
    {
        $metrics = $this->getWebhookMetrics($webhookId);
        
        if ($metrics['total_deliveries'] === 0) {
            return 1.0;
        }

        $successRate = $metrics['successful_deliveries'] / $metrics['total_deliveries'];
        $latencyScore = $metrics['average_latency'] < 1000 ? 1.0 : 0.5;

        return ($successRate * 0.7) + ($latencyScore * 0.3);
    }

    /**
     * Get webhook delivery metrics.
     *
     * @param string $webhookId
     * @return array
     */
    protected function getWebhookMetrics(string $webhookId): array
    {
        return DB::table('webhook_metrics')
            ->where('webhook_id', $webhookId)
            ->select(
                DB::raw('COUNT(*) as total_deliveries'),
                DB::raw('SUM(CASE WHEN status = "success" THEN 1 ELSE 0 END) as successful_deliveries'),
                DB::raw('AVG(latency) as average_latency')
            )
            ->first()
            ->toArray();
    }

    /**
     * Record webhook metrics.
     *
     * @param string $type
     * @param string $webhookId
     */
    protected function recordMetrics(string $type, string $webhookId): void
    {
        $metrics = [
            'webhook_id' => $webhookId,
            'type' => $type,
            'timestamp' => now()
        ];

        DB::table('webhook_metrics')->insert($metrics);
    }

    /**
     * Load service configuration from environment.
     */
    protected function loadConfiguration(): void
    {
        $this->maxRetries = config('webhooks.max_retries', $this->maxRetries);
        $this->timeout = config('webhooks.timeout', $this->timeout);
        $this->retryDelay = config('webhooks.retry_delay', $this->retryDelay);
    }

    /**
     * Initialize metrics collection.
     */
    protected function initializeMetrics(): void
    {
        $this->metricsCollector = array_merge(
            $this->metricsCollector,
            ['initialized_at' => now()]
        );
    }

    /**
     * Get subscribers for event type.
     *
     * @param string $event
     * @return array
     */
    protected function getEventSubscribers(string $event): array
    {
        return DB::table('webhook_subscriptions')
            ->where('status', 'active')
            ->whereJsonContains('events', $event)
            ->get()
            ->toArray();
    }

    /**
     * Check if webhook can receive dispatches.
     *
     * @param array $subscriber
     * @return bool
     */
    protected function canDispatchToSubscriber(array $subscriber): bool
    {
        return $subscriber['status'] === 'active' &&
            (!$this->securityConfig['ip_whitelist_enabled'] ||
            $this->isIpWhitelisted($subscriber));
    }

    /**
     * Enrich event payload with metadata.
     *
     * @param array $payload
     * @param string $deliveryId
     * @return array
     */
    protected function enrichEventPayload(array $payload, string $deliveryId): array
    {
        return array_merge($payload, [
            'meta' => [
                'delivery_id' => $deliveryId,
                'timestamp' => now()->toIso8601String(),
                'platform' => 'AUSTA Integration Platform'
            ]
        ]);
    }

    /**
     * Check if IP is whitelisted for webhook.
     *
     * @param array $subscriber
     * @return bool
     */
    protected function isIpWhitelisted(array $subscriber): bool
    {
        $whitelist = $subscriber['config']['ip_whitelist'] ?? [];
        return empty($whitelist) || in_array(request()->ip(), $whitelist);
    }
}