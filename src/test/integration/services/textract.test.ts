/**
 * @fileoverview Integration tests for AWS Textract service implementation
 * Verifies OCR processing capabilities, accuracy, and HIPAA compliance
 * @version 1.0.0
 */

import { jest } from '@jest/globals'; // ^29.0.0
import { TextractService } from '../../../backend/app/Services/AWS/TextractService';
import { TextractMock } from '../../mocks/aws-textract.mock';
import { setupTestEnvironment } from '../../utils/test-helpers';
import { Document, DocumentType, DocumentStatus } from '../../../web/src/app/core/interfaces/document.interface';
import { faker } from '@faker-js/faker';

// Test configuration constants
const TEST_TIMEOUT = 30000;
const MOCK_DOCUMENT_TYPES = ['id_document', 'proof_of_address', 'health_declaration', 'medical_record'];
const MIN_ACCURACY_THRESHOLD = 0.99;
const MAX_PROCESSING_TIME = 5000;

describe('TextractService Integration Tests', () => {
  let textractService: TextractService;
  let textractMock: TextractMock;
  let testEnv: any;

  beforeAll(async () => {
    testEnv = await setupTestEnvironment({
      cleanupEnabled: true,
      timeouts: { setup: 10000 }
    });
  });

  beforeEach(() => {
    // Initialize mock Textract service with high accuracy configuration
    textractMock = new TextractMock({
      defaultConfidence: 99,
      networkCondition: 'normal'
    });

    // Initialize TextractService with mock
    textractService = new TextractService();
    jest.spyOn(textractService, 'processDocument');
    jest.spyOn(textractService, 'validateResults');
  });

  afterEach(async () => {
    jest.clearAllMocks();
    textractMock.reset();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  describe('Document Processing', () => {
    it('should successfully process ID document with high accuracy', async () => {
      // Prepare test document
      const testDocument = {
        id: faker.string.uuid(),
        type: DocumentType.ID_DOCUMENT,
        content: Buffer.from('test-content'),
        storagePath: `test-documents/${faker.string.uuid()}/id.pdf`
      };

      // Configure mock response
      textractMock.setMockResponse(DocumentType.ID_DOCUMENT, {
        Blocks: [
          { BlockType: 'LINE', Text: 'ID Number: 123456789', Confidence: 99.5 },
          { BlockType: 'LINE', Text: 'Name: John Doe', Confidence: 99.8 },
          { BlockType: 'LINE', Text: 'Date of Birth: 1990-01-01', Confidence: 99.3 }
        ]
      });

      const startTime = Date.now();
      const result = await textractService.processDocument(testDocument as Document);
      const processingTime = Date.now() - startTime;

      // Verify processing results
      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(MIN_ACCURACY_THRESHOLD);
      expect(processingTime).toBeLessThan(MAX_PROCESSING_TIME);
      expect(textractService.processDocument).toHaveBeenCalledTimes(1);
      expect(textractService.validateResults).toHaveBeenCalledWith(
        expect.any(Object),
        DocumentType.ID_DOCUMENT
      );
    });

    it('should process health declaration with HIPAA compliance', async () => {
      const testDocument = {
        id: faker.string.uuid(),
        type: DocumentType.HEALTH_DECLARATION,
        content: Buffer.from('test-content'),
        storagePath: `test-documents/${faker.string.uuid()}/health.pdf`
      };

      textractMock.setMockResponse(DocumentType.HEALTH_DECLARATION, {
        Blocks: [
          { BlockType: 'LINE', Text: 'Patient: John Doe', Confidence: 99.7 },
          { BlockType: 'LINE', Text: 'Medical History: None', Confidence: 99.4 },
          { BlockType: 'LINE', Text: 'Medications: None', Confidence: 99.6 }
        ]
      });

      const result = await textractService.processDocument(testDocument as Document);

      // Verify HIPAA compliance
      expect(result.data).toBeDefined();
      expect(result.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            text: expect.any(String),
            confidence: expect.any(Number)
          })
        ])
      );
      expect(result.confidence).toBeGreaterThanOrEqual(MIN_ACCURACY_THRESHOLD);
    });

    it('should handle multiple document types with different confidence thresholds', async () => {
      const documents = MOCK_DOCUMENT_TYPES.map(type => ({
        id: faker.string.uuid(),
        type: type as DocumentType,
        content: Buffer.from('test-content'),
        storagePath: `test-documents/${faker.string.uuid()}/${type}.pdf`
      }));

      for (const doc of documents) {
        textractMock.setMockResponse(doc.type as DocumentType, {
          Blocks: [
            { BlockType: 'LINE', Text: `Sample ${doc.type} text`, Confidence: 99 }
          ]
        });

        const result = await textractService.processDocument(doc as Document);
        expect(result.confidence).toBeGreaterThanOrEqual(MIN_ACCURACY_THRESHOLD);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts gracefully', async () => {
      const testDocument = {
        id: faker.string.uuid(),
        type: DocumentType.ID_DOCUMENT,
        content: Buffer.from('test-content'),
        storagePath: `test-documents/${faker.string.uuid()}/id.pdf`
      };

      textractMock.setMockError(
        DocumentType.ID_DOCUMENT,
        new Error('Network timeout'),
        { networkCondition: 'timeout' }
      );

      await expect(textractService.processDocument(testDocument as Document))
        .rejects.toThrow('Network timeout');
    });

    it('should handle invalid document formats', async () => {
      const invalidDocument = {
        id: faker.string.uuid(),
        type: DocumentType.ID_DOCUMENT,
        content: Buffer.from('invalid-content'),
        storagePath: 'invalid.xyz'
      };

      textractMock.setMockError(
        DocumentType.ID_DOCUMENT,
        new Error('Invalid document format')
      );

      await expect(textractService.processDocument(invalidDocument as Document))
        .rejects.toThrow('Invalid document format');
    });

    it('should handle rate limiting scenarios', async () => {
      const documents = Array(10).fill(null).map(() => ({
        id: faker.string.uuid(),
        type: DocumentType.ID_DOCUMENT,
        content: Buffer.from('test-content'),
        storagePath: `test-documents/${faker.string.uuid()}/id.pdf`
      }));

      // Simulate rate limit after 5 requests
      let processedCount = 0;
      for (const doc of documents) {
        if (processedCount >= 5) {
          textractMock.setMockError(
            DocumentType.ID_DOCUMENT,
            new Error('Rate limit exceeded')
          );
        }

        if (processedCount < 5) {
          await expect(textractService.processDocument(doc as Document)).resolves.toBeDefined();
        } else {
          await expect(textractService.processDocument(doc as Document))
            .rejects.toThrow('Rate limit exceeded');
        }
        processedCount++;
      }
    });
  });

  describe('Performance Monitoring', () => {
    it('should process documents within acceptable time limits', async () => {
      const testDocument = {
        id: faker.string.uuid(),
        type: DocumentType.ID_DOCUMENT,
        content: Buffer.from('test-content'),
        storagePath: `test-documents/${faker.string.uuid()}/id.pdf`
      };

      const processingTimes: number[] = [];
      const iterations = 5;

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        await textractService.processDocument(testDocument as Document);
        processingTimes.push(Date.now() - startTime);
      }

      const averageTime = processingTimes.reduce((a, b) => a + b) / iterations;
      expect(averageTime).toBeLessThan(MAX_PROCESSING_TIME);
    });

    it('should maintain accuracy under load', async () => {
      const documents = Array(5).fill(null).map(() => ({
        id: faker.string.uuid(),
        type: DocumentType.ID_DOCUMENT,
        content: Buffer.from('test-content'),
        storagePath: `test-documents/${faker.string.uuid()}/id.pdf`
      }));

      const results = await Promise.all(
        documents.map(doc => textractService.processDocument(doc as Document))
      );

      results.forEach(result => {
        expect(result.confidence).toBeGreaterThanOrEqual(MIN_ACCURACY_THRESHOLD);
      });
    });
  });
});