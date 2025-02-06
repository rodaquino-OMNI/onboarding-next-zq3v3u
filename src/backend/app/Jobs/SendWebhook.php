<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * SendWebhook Job
 * 
 * Handles secure, reliable asynchronous delivery of webhook events to subscribers
 * with comprehensive retry logic and monitoring capabilities.
 *
 * @package App\Jobs
 * @version 1.0.0
 */
class SendWebhook implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    /**
     * The webhook endpoint URL.
     *
     * @var string
     */
    protected string $webhookUrl;

    /**
     * The event type being delivered.
     *
     * @var string
     */
    protected string $event;

    /**
     * The webhook payload data.
     *
     * @var array
     */
    protected array $payload;

    /**
     * The webhook signing secret.
     *
     * @var string
     */
    protected string $secret;

    /**
     * Maximum number of retry attempts.
     *
     * @var int
     */
    protected int $maxRetries = 3;

    /**
     * Request timeout in seconds.
     *
     * @var int
     */
    protected int $timeout = 30;

    /**
     * Backoff time between retries in minutes.
     *
     * @var int
     */
    protected int $backoffMinutes = 5;

    /**
     * Acceptable response status codes.
     *
     * @var array
     */
    protected array $allowedResponseCodes = [200, 201, 202, 204];

    /**
     * Delivery attempt metadata.
     *
     * @var array
     */
    protected array $deliveryMetadata;

    /**
     * Create a new job instance.
     *
     * @param string $webhookUrl The webhook endpoint URL
     * @param string $event The event type
     * @param array $payload The event payload
     * @param string $secret The webhook signing secret
     * @throws \InvalidArgumentException
     */
    public function __construct(string $webhookUrl, string $event, array $payload, string $secret)
    {
        if (!filter_var($webhookUrl, FILTER_VALIDATE_URL)) {
            throw new \InvalidArgumentException('Invalid webhook URL format');
        }

        if (!preg_match('/^https:\/\//i', $webhookUrl)) {
            throw new \InvalidArgumentException('Webhook URL must use HTTPS');
        }

        $this->webhookUrl = $webhookUrl;
        $this->event = $event;
        $this->payload = $payload;
        $this->secret = $secret;

        $this->deliveryMetadata = [
            'request_id' => uniqid('whk_', true),
            'timestamp' => time(),
            'attempts' => 0,
            'retry_count' => 0
        ];
    }

    /**
     * Execute the job.
     *
     * @return void
     */
    public function handle(): void
    {
        $this->deliveryMetadata['attempts']++;
        $signature = $this->generateSignature();

        $headers = [
            'Content-Type' => 'application/json',
            'User-Agent' => 'AUSTA-Webhook-Delivery/1.0',
            'X-Webhook-Signature' => $signature,
            'X-Webhook-Event' => $this->event,
            'X-Request-ID' => $this->deliveryMetadata['request_id']
        ];

        try {
            $startTime = microtime(true);
            
            $response = Http::withHeaders($headers)
                ->timeout($this->timeout)
                ->retry($this->maxRetries, $this->backoffMinutes * 60000, function ($exception, $request) {
                    $shouldRetry = $exception instanceof \Illuminate\Http\Client\ConnectionException
                        || ($exception instanceof \Illuminate\Http\Client\RequestException 
                            && in_array($exception->response->status(), [408, 429, 500, 502, 503, 504]));
                    
                    if ($shouldRetry) {
                        $this->deliveryMetadata['retry_count']++;
                        Log::warning('Webhook delivery retry initiated', [
                            'url' => $this->webhookUrl,
                            'event' => $this->event,
                            'request_id' => $this->deliveryMetadata['request_id'],
                            'attempt' => $this->deliveryMetadata['attempts'],
                            'exception' => $exception->getMessage()
                        ]);
                    }
                    
                    return $shouldRetry;
                })
                ->post($this->webhookUrl, $this->payload);

            $duration = (microtime(true) - $startTime) * 1000;
            $this->deliveryMetadata['duration_ms'] = $duration;

            if (!$this->validateResponse($response)) {
                throw new \RuntimeException(
                    "Invalid webhook response: HTTP {$response->status()}"
                );
            }

            Log::info('Webhook delivered successfully', [
                'url' => $this->webhookUrl,
                'event' => $this->event,
                'request_id' => $this->deliveryMetadata['request_id'],
                'duration_ms' => $duration,
                'status_code' => $response->status()
            ]);

        } catch (Throwable $exception) {
            if ($this->attempts() >= $this->maxRetries) {
                throw $exception;
            }

            $backoffDelay = $this->backoffMinutes * pow(2, $this->attempts() - 1);
            $this->release($backoffDelay * 60);

            Log::error('Webhook delivery failed', [
                'url' => $this->webhookUrl,
                'event' => $this->event,
                'request_id' => $this->deliveryMetadata['request_id'],
                'attempt' => $this->deliveryMetadata['attempts'],
                'next_attempt_delay' => $backoffDelay,
                'exception' => $exception->getMessage()
            ]);
        }
    }

    /**
     * Handle a job failure.
     *
     * @param \Throwable $exception
     * @return void
     */
    public function failed(Throwable $exception): void
    {
        Log::error('Webhook delivery permanently failed', [
            'url' => $this->webhookUrl,
            'event' => $this->event,
            'request_id' => $this->deliveryMetadata['request_id'],
            'attempts' => $this->deliveryMetadata['attempts'],
            'retry_count' => $this->deliveryMetadata['retry_count'],
            'exception' => $exception->getMessage(),
            'exception_trace' => $exception->getTraceAsString()
        ]);

        // Additional failure handling could be implemented here
        // such as notifying administrators or updating webhook subscription status
    }

    /**
     * Generate HMAC signature for webhook payload.
     *
     * @return string
     */
    protected function generateSignature(): string
    {
        $payloadString = json_encode($this->payload);
        $timestamp = $this->deliveryMetadata['timestamp'];
        $signatureData = $timestamp . '.' . $payloadString;
        
        $signature = hash_hmac('sha256', $signatureData, $this->secret, true);
        return 't=' . $timestamp . ',v1=' . base64_encode($signature);
    }

    /**
     * Validate webhook response.
     *
     * @param \Illuminate\Http\Client\Response $response
     * @return bool
     */
    protected function validateResponse($response): bool
    {
        if (!in_array($response->status(), $this->allowedResponseCodes)) {
            return false;
        }

        // Check rate limiting headers if present
        $rateLimit = $response->header('X-RateLimit-Remaining');
        if ($rateLimit !== null && (int)$rateLimit === 0) {
            Log::warning('Webhook rate limit reached', [
                'url' => $this->webhookUrl,
                'event' => $this->event,
                'request_id' => $this->deliveryMetadata['request_id']
            ]);
        }

        return true;
    }
}