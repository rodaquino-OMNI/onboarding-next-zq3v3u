/**
 * @fileoverview Integration tests for enrollment API endpoints
 * Implements HIPAA-compliant test cases for enrollment workflows
 * @version 1.0.0
 */

import { describe, beforeEach, it, expect } from 'jest';
import supertest from 'supertest'; // ^6.3.0
import { faker } from '@faker-js/faker'; // ^8.0.0
import { setupTestEnvironment, createAuthenticatedClient, waitForAsyncOperation } from '../../utils/test-helpers';
import { UserRole, Language } from '../../../web/src/app/core/interfaces/user.interface';
import { EnrollmentStatus, ENROLLMENT_STATUS_TRANSITIONS } from '../../../web/src/app/core/interfaces/enrollment.interface';
import { DocumentType } from '../../../web/src/app/core/interfaces/document.interface';

const API_BASE_URL = 'http://localhost:8000/api/v1';
const VALID_ENROLLMENT_STATUSES = Object.values(EnrollmentStatus);
const TEST_TIMEOUT = 30000;

describe('Enrollment API Integration Tests', () => {
  let testEnv;
  let apiClient;
  let testUser;
  let testEnrollments = [];

  beforeEach(async () => {
    // Initialize test environment
    testEnv = await setupTestEnvironment({
      cleanupEnabled: true,
      timeouts: { request: 10000 }
    });

    // Create authenticated client with individual role
    const authData = await createAuthenticatedClient(UserRole.Individual, {
      language: Language.English
    });
    apiClient = authData.client;
    testUser = authData.user;
  });

  afterEach(async () => {
    // Cleanup test data
    if (testEnrollments.length > 0) {
      await Promise.all(testEnrollments.map(enrollment => 
        apiClient.delete(`/enrollments/${enrollment.id}`)));
      testEnrollments = [];
    }
    await testEnv.cleanup();
  });

  describe('GET /enrollments', () => {
    it('should return paginated list of enrollments', async () => {
      // Create multiple test enrollments
      const enrollments = await Promise.all([
        createTestEnrollment(apiClient),
        createTestEnrollment(apiClient),
        createTestEnrollment(apiClient)
      ]);
      testEnrollments.push(...enrollments);

      const response = await apiClient.get('/enrollments?page=1&limit=10');

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.meta.pagination).toBeDefined();
      expect(response.body.data.length).toBeGreaterThanOrEqual(3);
    }, TEST_TIMEOUT);

    it('should filter enrollments by status', async () => {
      const enrollment = await createTestEnrollment(apiClient, {
        status: EnrollmentStatus.DOCUMENTS_PENDING
      });
      testEnrollments.push(enrollment);

      const response = await apiClient.get('/enrollments?status=documents_pending');

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data[0].status).toBe(EnrollmentStatus.DOCUMENTS_PENDING);
    });

    it('should properly mask sensitive PHI data in response', async () => {
      const enrollment = await createTestEnrollment(apiClient);
      testEnrollments.push(enrollment);

      const response = await apiClient.get('/enrollments');

      expect(response.status).toBe(200);
      expect(response.body.data[0].metadata.personal_info.ssn).toMatch(/^\*+$/);
    });
  });

  describe('POST /enrollments', () => {
    it('should create new enrollment with valid data', async () => {
      const enrollmentData = {
        metadata: {
          personal_info: {
            firstName: faker.person.firstName(),
            lastName: faker.person.lastName(),
            dateOfBirth: faker.date.past({ years: 30 }).toISOString().split('T')[0],
            gender: faker.helpers.arrayElement(['M', 'F', 'O']),
            ssn: faker.number.int({ min: 100000000, max: 999999999 }).toString(),
            maritalStatus: 'single',
            nationality: 'Brazilian',
            preferredLanguage: 'en'
          },
          address_info: {
            street: faker.location.street(),
            number: faker.number.int({ min: 1, max: 9999 }).toString(),
            city: faker.location.city(),
            state: faker.location.state(),
            zipCode: faker.location.zipCode(),
            country: 'Brazil',
            residenceSince: faker.date.past({ years: 2 }).toISOString().split('T')[0]
          },
          contact_info: {
            email: faker.internet.email(),
            phone: faker.phone.number('+55 ## #####-####'),
            preferredContactMethod: 'email'
          }
        }
      };

      const response = await apiClient.post('/enrollments', enrollmentData);
      testEnrollments.push(response.body.data);

      expect(response.status).toBe(201);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.status).toBe(EnrollmentStatus.DRAFT);
    });

    it('should validate required fields', async () => {
      const invalidData = {
        metadata: {
          personal_info: {
            firstName: faker.person.firstName()
            // Missing required fields
          }
        }
      };

      const response = await apiClient.post('/enrollments', invalidData);

      expect(response.status).toBe(422);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('GET /enrollments/:id', () => {
    it('should return enrollment details with related entities', async () => {
      const enrollment = await createTestEnrollment(apiClient, {
        includeDocuments: true,
        documentTypes: [DocumentType.ID_DOCUMENT, DocumentType.PROOF_OF_ADDRESS]
      });
      testEnrollments.push(enrollment);

      const response = await apiClient.get(`/enrollments/${enrollment.id}`);

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(enrollment.id);
      expect(response.body.data.documents).toBeInstanceOf(Array);
      expect(response.body.data.documents.length).toBe(2);
    });

    it('should return 404 for non-existent enrollment', async () => {
      const response = await apiClient.get('/enrollments/non-existent-id');
      expect(response.status).toBe(404);
    });
  });

  describe('PUT /enrollments/:id', () => {
    it('should update enrollment metadata', async () => {
      const enrollment = await createTestEnrollment(apiClient);
      testEnrollments.push(enrollment);

      const updateData = {
        metadata: {
          personal_info: {
            firstName: 'Updated Name'
          }
        }
      };

      const response = await apiClient.put(`/enrollments/${enrollment.id}`, updateData);

      expect(response.status).toBe(200);
      expect(response.body.data.metadata.personal_info.firstName).toBe('Updated Name');
    });

    it('should handle concurrent modifications', async () => {
      const enrollment = await createTestEnrollment(apiClient);
      testEnrollments.push(enrollment);

      // Simulate concurrent updates
      const update1 = apiClient.put(`/enrollments/${enrollment.id}`, {
        metadata: { personal_info: { firstName: 'Update 1' } }
      });
      const update2 = apiClient.put(`/enrollments/${enrollment.id}`, {
        metadata: { personal_info: { firstName: 'Update 2' } }
      });

      const [response1, response2] = await Promise.all([update1, update2]);
      expect([response1.status, response2.status]).toContain(409);
    });
  });

  describe('PUT /enrollments/:id/status', () => {
    it('should transition enrollment status with valid flow', async () => {
      const enrollment = await createTestEnrollment(apiClient);
      testEnrollments.push(enrollment);

      const validTransition = ENROLLMENT_STATUS_TRANSITIONS[enrollment.status][0];
      const response = await apiClient.put(`/enrollments/${enrollment.id}/status`, {
        status: validTransition
      });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe(validTransition);
    });

    it('should reject invalid status transitions', async () => {
      const enrollment = await createTestEnrollment(apiClient);
      testEnrollments.push(enrollment);

      const response = await apiClient.put(`/enrollments/${enrollment.id}/status`, {
        status: EnrollmentStatus.COMPLETED
      });

      expect(response.status).toBe(422);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('DELETE /enrollments/:id', () => {
    it('should soft delete enrollment and related entities', async () => {
      const enrollment = await createTestEnrollment(apiClient, {
        includeDocuments: true
      });
      testEnrollments.push(enrollment);

      const response = await apiClient.delete(`/enrollments/${enrollment.id}`);

      expect(response.status).toBe(200);
      
      // Verify soft delete
      const getResponse = await apiClient.get(`/enrollments/${enrollment.id}`);
      expect(getResponse.status).toBe(404);
    });
  });
});

/**
 * Creates a test enrollment with complete data
 * @param client - API client instance
 * @param options - Optional creation parameters
 * @returns Created enrollment object
 */
async function createTestEnrollment(client, options = {}) {
  const enrollmentData = {
    metadata: {
      personal_info: {
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        dateOfBirth: faker.date.past({ years: 30 }).toISOString().split('T')[0],
        gender: faker.helpers.arrayElement(['M', 'F', 'O']),
        ssn: faker.number.int({ min: 100000000, max: 999999999 }).toString(),
        maritalStatus: 'single',
        nationality: 'Brazilian',
        preferredLanguage: 'en'
      },
      address_info: {
        street: faker.location.street(),
        number: faker.number.int({ min: 1, max: 9999 }).toString(),
        city: faker.location.city(),
        state: faker.location.state(),
        zipCode: faker.location.zipCode(),
        country: 'Brazil',
        residenceSince: faker.date.past({ years: 2 }).toISOString().split('T')[0]
      },
      contact_info: {
        email: faker.internet.email(),
        phone: faker.phone.number('+55 ## #####-####'),
        preferredContactMethod: 'email'
      }
    }
  };

  const response = await client.post('/enrollments', enrollmentData);
  const enrollment = response.body.data;

  if (options.includeDocuments) {
    const documentTypes = options.documentTypes || [
      DocumentType.ID_DOCUMENT,
      DocumentType.PROOF_OF_ADDRESS
    ];

    await Promise.all(documentTypes.map(async type => {
      const formData = new FormData();
      const file = new File(['test'], `test-${type}.pdf`, { type: 'application/pdf' });
      formData.append('file', file);
      formData.append('type', type);
      
      await client.post(`/enrollments/${enrollment.id}/documents`, formData);
    }));
  }

  return enrollment;
}