/**
 * @fileoverview Integration tests for database seeding functionality
 * Verifies proper creation of initial and test data with HIPAA compliance
 * @version 1.0.0
 */

import { describe, beforeEach, it, expect } from 'jest';
import knex from 'knex';
import { setupTestEnvironment } from '../../utils/test-helpers';
import { cleanDatabase } from '../../utils/db-cleaner';
import { UserRole, Language } from '../../../web/src/app/core/interfaces/user.interface';
import { EnrollmentStatus } from '../../../web/src/app/core/interfaces/enrollment.interface';
import { DocumentType } from '../../../web/src/app/core/interfaces/document.interface';

// Test timeout configuration for HIPAA-compliant data operations
jest.setTimeout(TEST_TIMEOUT);

describe('Database Seeding Integration Tests', () => {
  let testEnv: any;

  beforeEach(async () => {
    // Setup clean test environment with HIPAA compliance
    testEnv = await setupTestEnvironment({
      cleanupEnabled: true,
      dbConfig: {
        client: 'mysql2',
        connection: {
          host: process.env.TEST_DB_HOST || 'localhost',
          database: process.env.TEST_DB_NAME || 'test',
          user: process.env.TEST_DB_USER || 'test',
          password: process.env.TEST_DB_PASSWORD || 'test'
        }
      }
    });

    await cleanDatabase(testEnv.db);
  });

  describe('Admin Users Seeding', () => {
    it('should create admin users with proper language settings and HIPAA compliance', async () => {
      // Query database for admin users
      const adminUsers = await testEnv.db('users')
        .where('role', UserRole.Admin)
        .orderBy('created_at');

      // Verify admin count
      expect(adminUsers).toHaveLength(2);

      // Verify English-speaking admin
      const enAdmin = adminUsers.find(u => u.preferences.language === Language.English);
      expect(enAdmin).toBeDefined();
      expect(enAdmin.mfaEnabled).toBe(true);
      expect(enAdmin.emailVerifiedAt).not.toBeNull();

      // Verify Portuguese-speaking admin
      const ptAdmin = adminUsers.find(u => u.preferences.language === Language.Portuguese);
      expect(ptAdmin).toBeDefined();
      expect(ptAdmin.mfaEnabled).toBe(true);
      expect(ptAdmin.emailVerifiedAt).not.toBeNull();

      // Verify HIPAA compliance
      adminUsers.forEach(admin => {
        expect(admin.email).toMatch(/^[^@]+@[^@]+\.[^@]+$/);
        expect(admin.preferences.notifications.email).toBeDefined();
        expect(admin.lastLoginAt).toBeDefined();
      });
    });
  });

  describe('Broker Users Seeding', () => {
    it('should create broker users with mixed languages and proper data protection', async () => {
      // Query database for broker users
      const brokers = await testEnv.db('users')
        .where('role', UserRole.Broker)
        .orderBy('created_at');

      // Verify broker count and language distribution
      expect(brokers).toHaveLength(4);
      const enBrokers = brokers.filter(b => b.preferences.language === Language.English);
      const ptBrokers = brokers.filter(b => b.preferences.language === Language.Portuguese);
      expect(enBrokers).toHaveLength(2);
      expect(ptBrokers).toHaveLength(2);

      // Verify broker data protection
      brokers.forEach(broker => {
        expect(broker.email).toMatch(/^[^@]+@[^@]+\.[^@]+$/);
        expect(broker.emailVerifiedAt).not.toBeNull();
        expect(broker.preferences.notifications).toBeDefined();
      });
    });
  });

  describe('Interviewer Users Seeding', () => {
    it('should create interviewer users with proper role and language settings', async () => {
      // Query database for interviewer users
      const interviewers = await testEnv.db('users')
        .where('role', UserRole.Interviewer)
        .orderBy('created_at');

      // Verify interviewer count and language distribution
      expect(interviewers).toHaveLength(6);
      const enInterviewers = interviewers.filter(i => i.preferences.language === Language.English);
      const ptInterviewers = interviewers.filter(i => i.preferences.language === Language.Portuguese);
      expect(enInterviewers).toHaveLength(3);
      expect(ptInterviewers).toHaveLength(3);

      // Verify interviewer-specific settings
      interviewers.forEach(interviewer => {
        expect(interviewer.emailVerifiedAt).not.toBeNull();
        expect(interviewer.preferences.notifications.email).toBe(true);
        expect(interviewer.preferences.notifications.inApp).toBe(true);
      });
    });
  });

  describe('Enrollment Data Seeding', () => {
    it('should create test enrollments with proper states and relationships', async () => {
      // Query database for enrollments
      const enrollments = await testEnv.db('enrollments')
        .select('*')
        .orderBy('created_at');

      // Verify enrollment count and status distribution
      expect(enrollments.length).toBeGreaterThan(0);
      const statusCounts = enrollments.reduce((acc, curr) => {
        acc[curr.status] = (acc[curr.status] || 0) + 1;
        return acc;
      }, {});

      // Verify status distribution
      expect(statusCounts[EnrollmentStatus.DRAFT]).toBeGreaterThan(0);
      expect(statusCounts[EnrollmentStatus.DOCUMENTS_PENDING]).toBeGreaterThan(0);
      expect(statusCounts[EnrollmentStatus.COMPLETED]).toBeGreaterThan(0);

      // Verify enrollment metadata and HIPAA compliance
      for (const enrollment of enrollments) {
        expect(enrollment.metadata.personal_info).toBeDefined();
        expect(enrollment.metadata.address_info).toBeDefined();
        expect(enrollment.metadata.contact_info).toBeDefined();
        expect(enrollment.progress).toBeGreaterThanOrEqual(0);
        expect(enrollment.progress).toBeLessThanOrEqual(100);

        // Verify associated documents
        const documents = await testEnv.db('documents')
          .where('enrollment_id', enrollment.id);
        
        if (enrollment.status !== EnrollmentStatus.DRAFT) {
          expect(documents.length).toBeGreaterThan(0);
          documents.forEach(doc => {
            expect(doc.type).toBeDefined();
            expect(doc.storagePath).toBeDefined();
            expect(doc.encryptionKey).toBeDefined();
          });
        }
      }
    });
  });

  describe('Document Data Seeding', () => {
    it('should create test documents with proper encryption and OCR data', async () => {
      // Query database for documents
      const documents = await testEnv.db('documents')
        .select('*')
        .orderBy('created_at');

      // Verify document types and encryption
      documents.forEach(doc => {
        expect(Object.values(DocumentType)).toContain(doc.type);
        expect(doc.storagePath).toMatch(/^test-documents\/.+/);
        expect(doc.encryptionKey).toBeDefined();
        expect(doc.ocrData).toBeDefined();
        expect(doc.ocrData.sensitiveDataFound).toBeDefined();
        expect(doc.retentionPeriod).toBeGreaterThan(0);
      });

      // Verify document type distribution
      const typeDistribution = documents.reduce((acc, curr) => {
        acc[curr.type] = (acc[curr.type] || 0) + 1;
        return acc;
      }, {});

      expect(typeDistribution[DocumentType.ID_DOCUMENT]).toBeGreaterThan(0);
      expect(typeDistribution[DocumentType.PROOF_OF_ADDRESS]).toBeGreaterThan(0);
      expect(typeDistribution[DocumentType.HEALTH_DECLARATION]).toBeGreaterThan(0);
    });
  });

  afterAll(async () => {
    // Cleanup test environment
    if (testEnv?.db) {
      await testEnv.db.destroy();
    }
  });
});