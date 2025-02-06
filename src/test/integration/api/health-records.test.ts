/**
 * @fileoverview Integration tests for health records API endpoints
 * Implements HIPAA-compliant testing with security validations
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'jest'; // ^29.0.0
import {
  setupTestEnvironment,
  createAuthenticatedClient,
  waitForAsyncOperation
} from '../../utils/test-helpers';
import { HealthRecord } from '../../../web/src/app/core/interfaces/health-record.interface';

// Test configuration constants
const API_BASE_URL = 'http://localhost:8000/api/v1';
const TEST_TIMEOUT = 10000;
const ENCRYPTION_KEY_VERSION = 'v1';
const HIPAA_HEADERS = { version: '2.0', compliance: 'strict' };

/**
 * Creates a test health record with required security metadata
 * @param overrides Optional field overrides
 * @param securityContext Security context for encryption
 * @returns Created test health record
 */
async function createTestHealthRecord(
  overrides: Partial<HealthRecord> = {},
  securityContext: { keyId: string; algorithm: string } = { 
    keyId: ENCRYPTION_KEY_VERSION, 
    algorithm: 'AES-256-GCM' 
  }
): Promise<HealthRecord> {
  const now = new Date().toISOString();
  
  const healthRecord: HealthRecord = {
    id: crypto.randomUUID(),
    enrollment_id: crypto.randomUUID(),
    health_data: {
      medical_history: ['Hypertension', 'Type 2 Diabetes'],
      current_medications: [{
        name: 'Metformin',
        dosage: '500mg',
        frequency: 'twice daily',
        start_date: '2023-01-01'
      }],
      allergies: ['Penicillin'],
      chronic_conditions: ['Hypertension'],
      family_history: ['Heart Disease'],
      lifestyle_factors: {
        smoking_status: 'non-smoker',
        exercise_frequency: '3x per week'
      },
      vital_signs: {
        blood_pressure: '120/80',
        heart_rate: 72,
        weight: 70,
        height: 170
      },
      immunizations: [{
        name: 'COVID-19',
        date: '2023-06-15',
        provider: 'Test Clinic'
      }],
      surgical_history: [{
        procedure: 'Appendectomy',
        date: '2020-03-15',
        hospital: 'Test Hospital'
      }],
      mental_health: {
        conditions: [],
        treatments: []
      },
      encryption_metadata: {
        algorithm: securityContext.algorithm,
        key_id: securityContext.keyId,
        encrypted_at: now
      }
    },
    verified: false,
    audit_trail: [{
      action: 'create',
      user_id: crypto.randomUUID(),
      timestamp: now,
      fields_accessed: ['medical_history', 'current_medications']
    }],
    retention_period: 365,
    submitted_at: now,
    created_at: now,
    updated_at: now,
    ...overrides
  };

  return healthRecord;
}

describe('Health Records API Integration Tests', () => {
  let testEnv: any;
  let apiClient: any;

  beforeEach(async () => {
    // Setup test environment with HIPAA compliance
    testEnv = await setupTestEnvironment({
      apiUrl: API_BASE_URL,
      headers: HIPAA_HEADERS
    });

    // Create authenticated client with proper permissions
    apiClient = await createAuthenticatedClient(testEnv, {
      role: 'interviewer',
      permissions: ['health-records:read', 'health-records:write']
    });
  });

  afterEach(async () => {
    await testEnv.cleanup();
  });

  describe('POST /health-records', () => {
    it('should create health record with proper encryption', async () => {
      // Create test health record
      const testRecord = await createTestHealthRecord();

      // Make API request with HIPAA headers
      const response = await apiClient.post('/health-records', testRecord, {
        headers: {
          'X-HIPAA-Compliance': HIPAA_HEADERS.version,
          'X-Encryption-Key-Version': ENCRYPTION_KEY_VERSION
        }
      });

      // Verify response
      expect(response.status).toBe(201);
      expect(response.data.id).toBeDefined();
      expect(response.data.health_data.encryption_metadata).toBeDefined();
      expect(response.data.audit_trail).toHaveLength(1);

      // Verify PHI field encryption
      const sensitiveFields = ['medical_history', 'current_medications', 'surgical_history'];
      sensitiveFields.forEach(field => {
        expect(response.data.health_data[field]).not.toEqual(testRecord.health_data[field]);
      });
    }, TEST_TIMEOUT);

    it('should enforce HIPAA compliance headers', async () => {
      const testRecord = await createTestHealthRecord();

      // Attempt request without HIPAA headers
      await expect(
        apiClient.post('/health-records', testRecord)
      ).rejects.toThrow('HIPAA compliance headers required');
    });

    it('should validate required health data fields', async () => {
      const invalidRecord = await createTestHealthRecord({
        health_data: {} as any
      });

      await expect(
        apiClient.post('/health-records', invalidRecord)
      ).rejects.toThrow('Invalid health data format');
    });
  });

  describe('GET /health-records/:id', () => {
    it('should retrieve health record with decrypted data', async () => {
      // Create test record first
      const testRecord = await createTestHealthRecord();
      const created = await apiClient.post('/health-records', testRecord);

      // Retrieve record
      const response = await apiClient.get(`/health-records/${created.data.id}`);

      // Verify response
      expect(response.status).toBe(200);
      expect(response.data.health_data).toBeDefined();
      expect(response.data.audit_trail).toBeDefined();

      // Verify audit trail update
      expect(response.data.audit_trail).toHaveLength(2); // Create + Read
      expect(response.data.audit_trail[1].action).toBe('read');
    });

    it('should enforce access control', async () => {
      const unauthorizedClient = await createAuthenticatedClient(testEnv, {
        role: 'individual',
        permissions: []
      });

      const testRecord = await createTestHealthRecord();
      const created = await apiClient.post('/health-records', testRecord);

      await expect(
        unauthorizedClient.get(`/health-records/${created.data.id}`)
      ).rejects.toThrow('Unauthorized access');
    });
  });

  describe('PUT /health-records/:id', () => {
    it('should update health record with encryption', async () => {
      // Create initial record
      const testRecord = await createTestHealthRecord();
      const created = await apiClient.post('/health-records', testRecord);

      // Prepare update
      const updates = {
        health_data: {
          ...created.data.health_data,
          medical_history: [...testRecord.health_data.medical_history, 'Asthma']
        }
      };

      // Update record
      const response = await apiClient.put(
        `/health-records/${created.data.id}`,
        updates,
        {
          headers: {
            'X-HIPAA-Compliance': HIPAA_HEADERS.version,
            'X-Encryption-Key-Version': ENCRYPTION_KEY_VERSION
          }
        }
      );

      // Verify response
      expect(response.status).toBe(200);
      expect(response.data.updated_at).not.toBe(created.data.updated_at);
      expect(response.data.audit_trail).toHaveLength(2); // Create + Update

      // Verify encryption of updated fields
      expect(response.data.health_data.medical_history)
        .not.toEqual(updates.health_data.medical_history);
    });

    it('should handle concurrent updates safely', async () => {
      const testRecord = await createTestHealthRecord();
      const created = await apiClient.post('/health-records', testRecord);

      // Simulate concurrent updates
      const update1 = apiClient.put(`/health-records/${created.data.id}`, {
        health_data: { medical_history: ['Update 1'] }
      });
      const update2 = apiClient.put(`/health-records/${created.data.id}`, {
        health_data: { medical_history: ['Update 2'] }
      });

      await expect(
        Promise.all([update1, update2])
      ).rejects.toThrow('Concurrent update detected');
    });
  });

  describe('DELETE /health-records/:id', () => {
    it('should mark record for deletion with retention period', async () => {
      const testRecord = await createTestHealthRecord();
      const created = await apiClient.post('/health-records', testRecord);

      const response = await apiClient.delete(`/health-records/${created.data.id}`);

      expect(response.status).toBe(200);
      expect(response.data.deletion_scheduled_at).toBeDefined();
      expect(response.data.retention_period).toBe(365);
    });

    it('should enforce retention policy', async () => {
      const testRecord = await createTestHealthRecord({
        retention_period: 7 // 7 days retention
      });
      const created = await apiClient.post('/health-records', testRecord);

      await apiClient.delete(`/health-records/${created.data.id}`);

      // Verify record still exists during retention period
      const response = await apiClient.get(`/health-records/${created.data.id}`);
      expect(response.status).toBe(200);
      expect(response.data.deletion_scheduled_at).toBeDefined();
    });
  });
});