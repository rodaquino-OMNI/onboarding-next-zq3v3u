/**
 * @fileoverview Integration tests for webhook management API endpoints
 * Tests webhook registration, delivery, security and HIPAA compliance
 * @version 1.0.0
 */

import { APIClient } from '../../utils/api-client';
import jest from 'jest'; // ^29.0.0
import nock from 'nock'; // ^13.0.0
import crypto from 'crypto'; // ^1.0.0

/**
 * Generates HMAC-SHA256 webhook signature for request validation
 * @param payload - Webhook payload to sign
 * @param secret - Webhook secret key
 * @param timestamp - Request timestamp
 * @returns Base64 encoded HMAC signature
 */
const generateWebhookSignature = (
  payload: string,
  secret: string,
  timestamp: string
): string => {
  const hmac = crypto.createHmac('sha256', secret);
  const signatureContent = `${timestamp}.${payload}`;
  hmac.update(signatureContent);
  return hmac.digest('base64');
};

/**
 * Webhook integration test suite with HIPAA compliance validation
 */
class WebhookTestSuite {
  private apiClient: APIClient;
  private baseURL: string;
  private webhookId: string;
  private webhookSecret: string;
  private retryAttempts: Map<string, number>;

  constructor() {
    this.baseURL = 'http://localhost:8000/api/v1';
    this.apiClient = new APIClient(this.baseURL);
    this.webhookSecret = crypto.randomBytes(32).toString('hex');
    this.retryAttempts = new Map();

    // Configure nock for webhook endpoint mocking
    nock.disableNetConnect();
    nock.enableNetConnect('localhost');
  }

  /**
   * Tests webhook registration with HIPAA compliance
   */
  public async testWebhookRegistration(): Promise<void> {
    const registrationPayload = {
      url: 'https://webhook.test.com/receive',
      events: ['enrollment.created', 'document.processed'],
      description: 'Test webhook endpoint',
      securityConfig: {
        encryptionRequired: true,
        tlsVersion: 'TLSv1.2',
        hipaaCompliant: true
      }
    };

    const response = await this.apiClient.post('/webhooks', registrationPayload, {
      headers: {
        'X-HIPAA-Compliance': 'enabled',
        'X-Security-Protocol': 'TLSv1.2'
      }
    });

    expect(response.status).toBe(201);
    expect(response.data).toHaveProperty('id');
    expect(response.data).toHaveProperty('secret');
    expect(response.data.securityConfig.hipaaCompliant).toBe(true);

    this.webhookId = response.data.id;
    this.webhookSecret = response.data.secret;
  }

  /**
   * Tests webhook delivery with retry mechanism
   */
  public async testDeliveryWithRetry(): Promise<void> {
    const testEvent = {
      type: 'enrollment.created',
      data: {
        enrollmentId: crypto.randomUUID(),
        timestamp: new Date().toISOString()
      }
    };

    // Mock endpoint with initial failures
    const mockEndpoint = nock('https://webhook.test.com')
      .post('/receive')
      .times(2)
      .reply(500)
      .post('/receive')
      .reply(200);

    // Trigger webhook delivery
    await this.apiClient.post(`/webhooks/${this.webhookId}/test`, testEvent);

    // Verify retry attempts
    const deliveryLogs = await this.apiClient.get(`/webhooks/${this.webhookId}/deliveries`);
    expect(deliveryLogs.data.attempts).toBe(3);
    expect(deliveryLogs.data.successful).toBe(true);
    expect(deliveryLogs.data.retryIntervals).toEqual([1000, 2000]); // Exponential backoff
  }

  /**
   * Tests webhook security validation
   */
  public async testSecurityValidation(): Promise<void> {
    const timestamp = new Date().toISOString();
    const payload = {
      type: 'document.processed',
      data: {
        documentId: crypto.randomUUID(),
        status: 'PROCESSED'
      }
    };

    const signature = generateWebhookSignature(
      JSON.stringify(payload),
      this.webhookSecret,
      timestamp
    );

    // Test valid signature
    const validResponse = await this.apiClient.post(
      `/webhooks/${this.webhookId}/test`,
      payload,
      {
        headers: {
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': timestamp
        }
      }
    );
    expect(validResponse.status).toBe(200);

    // Test invalid signature
    const invalidResponse = await this.apiClient.post(
      `/webhooks/${this.webhookId}/test`,
      payload,
      {
        headers: {
          'X-Webhook-Signature': 'invalid',
          'X-Webhook-Timestamp': timestamp
        }
      }
    }).catch(err => err.response);
    expect(invalidResponse.status).toBe(401);
  }

  /**
   * Tests webhook update functionality
   */
  public async testWebhookUpdate(): Promise<void> {
    const updatePayload = {
      description: 'Updated test webhook',
      events: ['enrollment.created', 'enrollment.updated'],
      securityConfig: {
        encryptionRequired: true,
        tlsVersion: 'TLSv1.3',
        hipaaCompliant: true
      }
    };

    const response = await this.apiClient.put(
      `/webhooks/${this.webhookId}`,
      updatePayload
    );

    expect(response.status).toBe(200);
    expect(response.data.description).toBe(updatePayload.description);
    expect(response.data.events).toEqual(updatePayload.events);
    expect(response.data.securityConfig.tlsVersion).toBe('TLSv1.3');
  }

  /**
   * Tests webhook deletion with audit trail
   */
  public async testWebhookDeletion(): Promise<void> {
    const response = await this.apiClient.delete(`/webhooks/${this.webhookId}`);
    expect(response.status).toBe(200);

    // Verify audit trail
    const auditLog = await this.apiClient.get(`/audit-logs`, {
      params: {
        resourceType: 'webhook',
        resourceId: this.webhookId,
        action: 'delete'
      }
    });

    expect(auditLog.data.length).toBeGreaterThan(0);
    expect(auditLog.data[0].details).toHaveProperty('reason');
  }
}

// Test suite setup
describe('Webhook Integration Tests', () => {
  let webhookTests: WebhookTestSuite;

  beforeEach(() => {
    webhookTests = new WebhookTestSuite();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should register webhook with HIPAA compliance', async () => {
    await webhookTests.testWebhookRegistration();
  });

  it('should handle delivery with retry mechanism', async () => {
    await webhookTests.testDeliveryWithRetry();
  });

  it('should validate webhook signatures', async () => {
    await webhookTests.testSecurityValidation();
  });

  it('should update webhook configuration', async () => {
    await webhookTests.testWebhookUpdate();
  });

  it('should delete webhook with audit trail', async () => {
    await webhookTests.testWebhookDeletion();
  });
});

export { WebhookTestSuite };