/**
 * @fileoverview LGPD (Brazilian General Data Protection Law) compliance test suite
 * Validates privacy controls, data handling, and consent management requirements
 * @version 1.0.0
 */

import { jest } from 'jest';
import dayjs from 'dayjs';
import {
  setupTestEnvironment,
  createAuthenticatedClient,
  waitForAsyncOperation
} from '../utils/test-helpers';
import { generateTestData } from '../utils/data-generators';
import { Language } from '../../web/src/app/core/interfaces/user.interface';

// Test configuration constants
const TEST_TIMEOUT = 30000;
const CONSENT_EXPIRY_DAYS = 730; // 2 years
const DATA_RETENTION_PERIOD = 5; // years
const MAX_RESPONSE_TIME_MS = 15000;
const SUPPORTED_LANGUAGES = ['pt-BR', 'en-US'];

/**
 * LGPD compliance test suite
 * Validates implementation of Brazilian data protection requirements
 */
@jest.describe('LGPD Compliance Tests')
export class LGPDComplianceTest {
  private apiClient;
  private testUser;
  private consentData;
  private privacyConfig;

  constructor() {
    this.setupTestSuite();
  }

  /**
   * Initializes test environment before each test
   */
  @jest.beforeEach()
  private async setupTestSuite(): Promise<void> {
    const env = await setupTestEnvironment({
      cleanupEnabled: true,
      timeouts: { request: MAX_RESPONSE_TIME_MS }
    });

    this.apiClient = env.apiClient;
    this.testUser = await generateTestData({
      language: Language.Portuguese,
      includeConsent: true
    });

    // Configure LGPD-specific headers
    this.apiClient.setHeaders({
      'X-LGPD-Consent-ID': this.testUser.consentId,
      'X-LGPD-Language': 'pt-BR'
    });
  }

  /**
   * Tests consent collection and management compliance
   */
  @jest.test('Should validate consent collection and management')
  public async testConsentManagement(): Promise<void> {
    // Test explicit consent collection
    const consentResponse = await this.apiClient.post('/consent', {
      userId: this.testUser.id,
      purpose: 'healthcare_enrollment',
      dataCategories: ['personal', 'health', 'documents'],
      expiryDays: CONSENT_EXPIRY_DAYS,
      language: 'pt-BR'
    });

    expect(consentResponse.status).toBe(201);
    expect(consentResponse.data.consentId).toBeDefined();
    expect(consentResponse.data.timestamp).toBeDefined();

    // Verify consent storage
    const storedConsent = await this.apiClient.get(
      `/consent/${consentResponse.data.consentId}`
    );

    expect(storedConsent.data.status).toBe('active');
    expect(storedConsent.data.purposes).toContain('healthcare_enrollment');
    expect(storedConsent.data.auditTrail).toBeDefined();

    // Test consent withdrawal
    const withdrawalResponse = await this.apiClient.post(
      `/consent/${consentResponse.data.consentId}/withdraw`,
      {
        reason: 'user_request',
        effectiveImmediately: true
      }
    );

    expect(withdrawalResponse.status).toBe(200);
    expect(withdrawalResponse.data.status).toBe('withdrawn');

    // Verify data processing stopped
    const processingStatus = await this.apiClient.get(
      `/users/${this.testUser.id}/processing-status`
    );

    expect(processingStatus.data.isProcessingAllowed).toBe(false);
  }

  /**
   * Tests data subject rights implementation
   */
  @jest.test('Should validate data subject rights implementation')
  public async testDataSubjectRights(): Promise<void> {
    // Test data access right
    const accessRequest = await this.apiClient.post('/data-requests', {
      userId: this.testUser.id,
      type: 'access',
      format: 'json'
    });

    expect(accessRequest.status).toBe(202);
    
    // Wait for processing
    const { success } = await waitForAsyncOperation(
      MAX_RESPONSE_TIME_MS,
      {
        checkInterval: 1000,
        successCondition: async () => {
          const status = await this.apiClient.get(
            `/data-requests/${accessRequest.data.requestId}`
          );
          return status.data.status === 'completed';
        }
      }
    );

    expect(success).toBe(true);

    // Verify data completeness
    const exportedData = await this.apiClient.get(
      `/data-requests/${accessRequest.data.requestId}/download`
    );

    expect(exportedData.data.personalInfo).toBeDefined();
    expect(exportedData.data.healthRecords).toBeDefined();
    expect(exportedData.data.consentHistory).toBeDefined();

    // Test data deletion right
    const deletionRequest = await this.apiClient.post('/data-requests', {
      userId: this.testUser.id,
      type: 'deletion',
      reason: 'user_request'
    });

    expect(deletionRequest.status).toBe(202);

    // Verify cascade deletion
    await waitForAsyncOperation(MAX_RESPONSE_TIME_MS);
    const userData = await this.apiClient.get(`/users/${this.testUser.id}`);
    expect(userData.status).toBe(404);
  }

  /**
   * Tests privacy notice and language support
   */
  @jest.test('Should validate privacy notices and language support')
  public async testPrivacyNotices(): Promise<void> {
    // Test privacy notice content
    const privacyNotice = await this.apiClient.get('/privacy-notice', {
      headers: { 'Accept-Language': 'pt-BR' }
    });

    expect(privacyNotice.data.version).toBeDefined();
    expect(privacyNotice.data.lastUpdated).toBeDefined();
    expect(privacyNotice.data.content).toContain('Proteção de Dados');

    // Test notice versioning
    const noticeVersions = await this.apiClient.get('/privacy-notice/versions');
    expect(noticeVersions.data.length).toBeGreaterThan(0);

    // Test language availability
    for (const language of SUPPORTED_LANGUAGES) {
      const localizedNotice = await this.apiClient.get('/privacy-notice', {
        headers: { 'Accept-Language': language }
      });
      expect(localizedNotice.status).toBe(200);
      expect(localizedNotice.data.language).toBe(language);
    }

    // Test notice acknowledgment
    const acknowledgment = await this.apiClient.post('/privacy-notice/acknowledge', {
      userId: this.testUser.id,
      noticeVersion: privacyNotice.data.version,
      language: 'pt-BR'
    });

    expect(acknowledgment.status).toBe(200);
    expect(acknowledgment.data.timestamp).toBeDefined();
  }

  /**
   * Tests data retention and expiration handling
   */
  @jest.test('Should validate data retention policies')
  public async testDataRetention(): Promise<void> {
    // Create test data with retention period
    const testData = await this.apiClient.post('/test-data', {
      userId: this.testUser.id,
      retentionPeriod: DATA_RETENTION_PERIOD
    });

    expect(testData.status).toBe(201);
    expect(testData.data.expiryDate).toBeDefined();

    // Verify retention period calculation
    const expiryDate = dayjs(testData.data.expiryDate);
    const creationDate = dayjs(testData.data.createdAt);
    const retentionYears = expiryDate.diff(creationDate, 'year');

    expect(retentionYears).toBe(DATA_RETENTION_PERIOD);

    // Test data expiration handling
    const expiredData = await this.apiClient.post('/test-data/expire', {
      dataId: testData.data.id
    });

    expect(expiredData.status).toBe(200);
    expect(expiredData.data.status).toBe('expired');

    // Verify data inaccessibility after expiration
    const accessAttempt = await this.apiClient.get(
      `/test-data/${testData.data.id}`
    );
    expect(accessAttempt.status).toBe(404);
  }

  /**
   * Cleanup after tests
   */
  @jest.afterEach()
  private async cleanup(): Promise<void> {
    await this.apiClient.post('/test-data/cleanup', {
      userId: this.testUser.id
    });
  }
}