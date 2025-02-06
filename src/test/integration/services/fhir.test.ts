/**
 * @fileoverview Integration tests for FHIR service implementation
 * Tests EMR integration, data conversion, and HIPAA compliance
 * @version 1.0.0
 */

import { jest } from '@jest/globals';
import nock from 'nock'; // ^13.3.0
import { Bundle, Patient, Observation } from 'fhir/r4'; // ^4.0.1
import { FHIRValidator } from 'fhir-validator'; // ^2.0.0
import { 
  setupTestEnvironment,
  createAuthenticatedClient
} from '../../utils/test-helpers';
import {
  generateHealthRecord,
  generateEnrollment
} from '../../utils/data-generators';
import { EnrollmentStatus } from '../../../web/src/app/core/interfaces/enrollment.interface';
import { DocumentType } from '../../../web/src/app/core/interfaces/document.interface';

// Global test configuration
const EMR_BASE_URL = 'http://emr-test.example.com/fhir';
const FHIR_VERSION = '4.0.1';
const EMR_TIMEOUT = 5000;
const MAX_RETRIES = 3;

describe('FHIR Service Integration Tests', () => {
  let testEnv: any;
  let apiClient: any;
  let fhirValidator: any;
  let emrScope: nock.Scope;

  beforeEach(async () => {
    // Setup test environment with enhanced isolation
    testEnv = await setupTestEnvironment({
      cleanupEnabled: true,
      timeouts: { request: EMR_TIMEOUT }
    });

    // Initialize authenticated API client
    apiClient = await createAuthenticatedClient('admin');

    // Setup FHIR validator
    fhirValidator = new FHIRValidator({
      version: FHIR_VERSION,
      validatePHI: true
    });

    // Configure EMR mock server
    emrScope = nock(EMR_BASE_URL)
      .defaultReplyHeaders({
        'Content-Type': 'application/fhir+json',
        'X-FHIR-Version': FHIR_VERSION
      });

    // Enable request logging for debugging
    nock.emitter.on('no match', (req) => {
      console.warn('No matching mock for request:', req.method, req.path);
    });
  });

  afterEach(async () => {
    // Verify all expected EMR calls were made
    expect(emrScope.isDone()).toBeTruthy();
    
    // Clean up nock mocks
    nock.cleanAll();
    
    // Reset test environment
    await testEnv.cleanup();
  });

  describe('FHIR Data Conversion', () => {
    test('should convert health record to valid FHIR resource', async () => {
      // Generate test enrollment with health record
      const enrollment = await generateEnrollment(
        EnrollmentStatus.HEALTH_DECLARATION_PENDING
      );
      const healthRecord = await generateHealthRecord(enrollment.id);

      // Mock EMR endpoint for FHIR resource validation
      emrScope
        .post('/Patient/$validate')
        .reply(200, { resourceType: 'OperationOutcome', issue: [] });

      // Convert health record to FHIR
      const response = await apiClient.post('/api/v1/fhir/convert', {
        enrollmentId: enrollment.id,
        healthRecord
      });

      // Validate response structure
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('resourceType', 'Bundle');
      
      // Validate FHIR compliance
      const validationResult = await fhirValidator.validate(response.data);
      expect(validationResult.valid).toBeTruthy();

      // Verify PHI field encryption
      const patient = response.data.entry.find(
        (e: any) => e.resource.resourceType === 'Patient'
      );
      expect(patient.resource.identifier[0].system).toMatch(/^encrypted:/);
    });
  });

  describe('EMR Integration', () => {
    test('should successfully transmit FHIR data to EMR system', async () => {
      const enrollment = await generateEnrollment(
        EnrollmentStatus.HEALTH_DECLARATION_PENDING
      );
      const healthRecord = await generateHealthRecord(enrollment.id);

      // Mock EMR endpoints
      emrScope
        .post('/Bundle')
        .reply(201, { resourceType: 'Bundle', id: 'test-bundle-id' })
        .get('/Bundle/test-bundle-id')
        .reply(200, { resourceType: 'Bundle', id: 'test-bundle-id' });

      // Attempt EMR transmission
      const response = await apiClient.post('/api/v1/fhir/transmit', {
        enrollmentId: enrollment.id,
        healthRecord,
        emrEndpoint: EMR_BASE_URL
      });

      // Verify successful transmission
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('bundleId', 'test-bundle-id');
      expect(response.data).toHaveProperty('status', 'completed');

      // Verify audit logging
      const auditLog = await apiClient.get('/api/v1/audit-logs', {
        params: { resourceId: enrollment.id }
      });
      expect(auditLog.data.events).toContainEqual(
        expect.objectContaining({
          action: 'FHIR_TRANSMIT',
          status: 'SUCCESS'
        })
      );
    });

    test('should handle EMR system timeouts with retry mechanism', async () => {
      const enrollment = await generateEnrollment(
        EnrollmentStatus.HEALTH_DECLARATION_PENDING
      );

      // Mock EMR timeout then success
      emrScope
        .post('/Bundle')
        .times(2)
        .replyWithError({ code: 'ETIMEDOUT' })
        .post('/Bundle')
        .reply(201, { resourceType: 'Bundle', id: 'test-bundle-id' });

      const response = await apiClient.post('/api/v1/fhir/transmit', {
        enrollmentId: enrollment.id,
        healthRecord: await generateHealthRecord(enrollment.id),
        emrEndpoint: EMR_BASE_URL
      });

      expect(response.status).toBe(200);
      expect(response.data.retryCount).toBe(2);
    });
  });

  describe('Webhook Integration', () => {
    test('should notify subscribers of FHIR updates', async () => {
      const webhookUrl = 'https://webhook.test/fhir-updates';
      const webhookScope = nock(webhookUrl)
        .post('/')
        .reply(200, { received: true });

      const enrollment = await generateEnrollment(
        EnrollmentStatus.HEALTH_DECLARATION_PENDING
      );

      // Register webhook
      await apiClient.post('/api/v1/webhooks', {
        url: webhookUrl,
        events: ['fhir.update'],
        secret: 'test-secret'
      });

      // Trigger FHIR update
      await apiClient.post('/api/v1/fhir/update', {
        enrollmentId: enrollment.id,
        healthRecord: await generateHealthRecord(enrollment.id)
      });

      // Verify webhook was called
      expect(webhookScope.isDone()).toBeTruthy();
    });
  });

  describe('Security Validation', () => {
    test('should enforce HIPAA-compliant data transmission', async () => {
      const enrollment = await generateEnrollment(
        EnrollmentStatus.HEALTH_DECLARATION_PENDING
      );
      const healthRecord = await generateHealthRecord(enrollment.id);

      // Mock EMR endpoint with security validation
      emrScope
        .post('/Bundle')
        .matchHeader('X-HIPAA-Compliance', 'enabled')
        .matchHeader('Authorization', /^Bearer .+$/)
        .reply(201, { resourceType: 'Bundle', id: 'test-bundle-id' });

      const response = await apiClient.post('/api/v1/fhir/transmit', {
        enrollmentId: enrollment.id,
        healthRecord,
        emrEndpoint: EMR_BASE_URL
      });

      expect(response.status).toBe(200);

      // Verify PHI field encryption
      const auditLog = await apiClient.get('/api/v1/audit-logs', {
        params: { resourceId: enrollment.id }
      });
      expect(auditLog.data.events).toContainEqual(
        expect.objectContaining({
          action: 'PHI_ACCESS',
          encryptionVerified: true
        })
      );
    });
  });
});