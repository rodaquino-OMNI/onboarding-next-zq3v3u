/**
 * @fileoverview Integration tests for document management API endpoints
 * Implements HIPAA-compliant testing for document processing and storage
 * @version 1.0.0
 */

import { describe, it, expect } from 'jest';
import { setupTestEnvironment, createAuthenticatedClient } from '../../utils/test-helpers';
import { Document } from '../../web/src/app/core/interfaces/document.interface';
import { HIPAAValidationHelper } from '@hipaa/validation'; // ^2.0.0

// Test configuration constants
const TEST_TIMEOUT = 30000;
const VALID_DOCUMENT_TYPES = ['id_document', 'proof_of_address', 'health_declaration', 'medical_record'];
const PHI_DETECTION_THRESHOLD = 0.95;

/**
 * Document API integration test suite
 * Tests HIPAA-compliant document management functionality
 */
describe('Document API Integration Tests', () => {
  let apiClient;
  let testEnrollmentId: string;
  let hipaaValidator: HIPAAValidationHelper;

  beforeAll(async () => {
    // Initialize test environment with HIPAA compliance setup
    const testEnv = await setupTestEnvironment();
    const { user, token } = await createAuthenticatedClient();
    
    apiClient = testEnv.apiClient;
    apiClient.setAuthToken(token);
    testEnrollmentId = user.enrollmentId;
    hipaaValidator = new HIPAAValidationHelper();
  }, TEST_TIMEOUT);

  describe('Document Upload', () => {
    it('should upload document with PHI detection and encryption', async () => {
      const testFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const documentMetadata = {
        type: 'health_declaration',
        enrollmentId: testEnrollmentId
      };

      const response = await apiClient.uploadDocument(documentMetadata, testFile);

      expect(response.status).toBe(200);
      expect(response.data.document).toBeDefined();
      expect(response.data.document.encryptionKey).toBeDefined();
      expect(response.data.document.storagePath).toMatch(/^encrypted\//);
      
      // Verify HIPAA compliance
      const hipaaValidation = await hipaaValidator.validateStorage(response.data.document);
      expect(hipaaValidation.compliant).toBe(true);
    });

    it('should reject documents with unencrypted PHI', async () => {
      const testFile = new File(['unencrypted PHI content'], 'test.pdf', { type: 'application/pdf' });
      const documentMetadata = {
        type: 'medical_record',
        enrollmentId: testEnrollmentId
      };

      await expect(apiClient.uploadDocument(documentMetadata, testFile))
        .rejects
        .toThrow('Unencrypted PHI detected');
    });
  });

  describe('Document Processing', () => {
    it('should process document with OCR and PHI detection', async () => {
      const testFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const uploadResponse = await apiClient.uploadDocument({
        type: 'id_document',
        enrollmentId: testEnrollmentId
      }, testFile);

      const documentId = uploadResponse.data.document.id;
      const maxAttempts = 5;
      let attempts = 0;
      let document: Document;

      // Poll for OCR completion
      while (attempts < maxAttempts) {
        document = await apiClient.getDocument(documentId);
        if (document.status === 'PROCESSED') break;
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      }

      expect(document.status).toBe('PROCESSED');
      expect(document.ocrData).toBeDefined();
      expect(document.ocrData.confidence).toBeGreaterThan(0.8);
      expect(document.ocrData.sensitiveDataFound).toBeDefined();
    });

    it('should maintain audit trail for document processing', async () => {
      const testFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const response = await apiClient.uploadDocument({
        type: 'proof_of_address',
        enrollmentId: testEnrollmentId
      }, testFile);

      const auditTrail = await apiClient.getDocumentAuditTrail(response.data.document.id);
      
      expect(auditTrail).toContainEqual(expect.objectContaining({
        action: 'UPLOAD',
        status: 'SUCCESS'
      }));
    });
  });

  describe('Document Access Control', () => {
    it('should enforce role-based access control', async () => {
      const { token: unauthorizedToken } = await createAuthenticatedClient('unauthorized_role');
      apiClient.setAuthToken(unauthorizedToken);

      await expect(apiClient.getDocument('test-document-id'))
        .rejects
        .toThrow('Unauthorized access');
    });

    it('should track document access attempts', async () => {
      const testFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const response = await apiClient.uploadDocument({
        type: 'medical_record',
        enrollmentId: testEnrollmentId
      }, testFile);

      const documentId = response.data.document.id;
      await apiClient.getDocument(documentId);

      const accessLogs = await apiClient.getDocumentAccessLogs(documentId);
      expect(accessLogs).toContainEqual(expect.objectContaining({
        action: 'VIEW',
        userId: expect.any(String)
      }));
    });
  });

  describe('Document Retention', () => {
    it('should enforce document retention policies', async () => {
      const testFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const response = await apiClient.uploadDocument({
        type: 'health_declaration',
        enrollmentId: testEnrollmentId,
        retentionPeriod: 30 // 30 days
      }, testFile);

      const document = await apiClient.getDocument(response.data.document.id);
      expect(document.retentionPeriod).toBe(30);
      expect(document.expiryDate).toBeDefined();
    });

    it('should handle document expiration', async () => {
      const testFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const response = await apiClient.uploadDocument({
        type: 'medical_record',
        enrollmentId: testEnrollmentId,
        retentionPeriod: -1 // Expired
      }, testFile);

      await expect(apiClient.getDocument(response.data.document.id))
        .rejects
        .toThrow('Document has expired');
    });
  });

  describe('Document Verification', () => {
    it('should verify document authenticity', async () => {
      const testFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const response = await apiClient.uploadDocument({
        type: 'id_document',
        enrollmentId: testEnrollmentId
      }, testFile);

      const verificationResult = await apiClient.verifyDocument(
        response.data.document.id,
        { verifierNotes: 'Document verified successfully' }
      );

      expect(verificationResult.status).toBe('VERIFIED');
      expect(verificationResult.verifiedBy).toBeDefined();
      expect(verificationResult.verifiedAt).toBeDefined();
    });

    it('should reject invalid documents', async () => {
      const testFile = new File(['invalid content'], 'test.pdf', { type: 'application/pdf' });
      const response = await apiClient.uploadDocument({
        type: 'proof_of_address',
        enrollmentId: testEnrollmentId
      }, testFile);

      await expect(apiClient.verifyDocument(
        response.data.document.id,
        { verifierNotes: 'Invalid document', rejectionReason: 'Document appears altered' }
      )).resolves.toMatchObject({
        status: 'REJECTED'
      });
    });
  });
});