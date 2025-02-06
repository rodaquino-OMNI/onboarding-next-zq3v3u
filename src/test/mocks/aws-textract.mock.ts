/**
 * @fileoverview Mock implementation of AWS Textract service for testing document OCR processing
 * Implements configurable accuracy levels and error scenarios for comprehensive testing
 * @version 1.0.0
 */

import { mockApiResponse } from '../utils/test-helpers';
import { DocumentType } from '../../web/src/app/core/interfaces/document.interface';
import { jest } from '@jest/globals';

// Supported document types for OCR processing
export const MOCK_SUPPORTED_DOCUMENT_TYPES = [
  DocumentType.ID_DOCUMENT,
  DocumentType.PROOF_OF_ADDRESS,
  DocumentType.HEALTH_DECLARATION
] as const;

// Network condition simulation delays (ms)
export const MOCK_NETWORK_CONDITIONS = {
  normal: 0,
  slow: 1000,
  timeout: 5000
} as const;

// Default processing delay (ms)
export const MOCK_PROCESSING_DELAY = 100;

/**
 * Enhanced mock implementation of AWS Textract service
 * Supports configurable accuracy levels and network conditions
 */
export class MockTextractService {
  private mockResponses: Map<string, object>;
  private jobStatuses: Map<string, string>;
  private confidenceScores: Map<string, number>;
  private networkConditions: typeof MOCK_NETWORK_CONDITIONS;
  private errorScenarios: Map<string, Error>;

  /**
   * Initialize mock Textract service with configuration
   */
  constructor(config: {
    defaultConfidence?: number;
    networkCondition?: keyof typeof MOCK_NETWORK_CONDITIONS;
  } = {}) {
    this.mockResponses = new Map();
    this.jobStatuses = new Map();
    this.confidenceScores = new Map();
    this.networkConditions = MOCK_NETWORK_CONDITIONS;
    this.errorScenarios = new Map();

    // Initialize default responses for supported document types
    MOCK_SUPPORTED_DOCUMENT_TYPES.forEach(type => {
      this.setDefaultResponse(type, config.defaultConfidence || 95);
    });

    // Set up spy for monitoring calls
    jest.spyOn(this, 'processDocument');
    jest.spyOn(this, 'getJobStatus');
  }

  /**
   * Process document with configurable accuracy and network conditions
   */
  public async processDocument(
    document: {
      type: DocumentType;
      content: Buffer | string;
    },
    options: {
      jobId?: string;
      confidence?: number;
      networkCondition?: keyof typeof MOCK_NETWORK_CONDITIONS;
    } = {}
  ): Promise<object> {
    // Validate document type
    if (!MOCK_SUPPORTED_DOCUMENT_TYPES.includes(document.type)) {
      throw new Error(`Unsupported document type: ${document.type}`);
    }

    // Check for configured error scenario
    const error = this.errorScenarios.get(document.type);
    if (error) {
      throw error;
    }

    // Generate job ID if not provided
    const jobId = options.jobId || `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.jobStatuses.set(jobId, 'IN_PROGRESS');

    // Apply network delay
    const delay = this.networkConditions[options.networkCondition || 'normal'];
    await new Promise(resolve => setTimeout(resolve, delay));

    // Get mock response template
    const response = this.mockResponses.get(document.type) || this.getDefaultResponse(document.type);

    // Apply confidence score
    const confidence = options.confidence || this.confidenceScores.get(document.type) || 95;
    const processedResponse = this.applyConfidenceScore(response, confidence);

    // Update job status
    this.jobStatuses.set(jobId, 'SUCCEEDED');

    return {
      ...processedResponse,
      JobId: jobId,
      JobStatus: 'SUCCEEDED',
      Timestamp: new Date().toISOString()
    };
  }

  /**
   * Get status of mock processing job
   */
  public getJobStatus(jobId: string): object {
    const status = this.jobStatuses.get(jobId);
    if (!status) {
      throw new Error(`Job not found: ${jobId}`);
    }

    return {
      JobId: jobId,
      Status: status,
      Timestamp: new Date().toISOString()
    };
  }

  /**
   * Configure custom mock response with accuracy levels
   */
  public setMockResponse(
    documentType: DocumentType,
    response: object,
    accuracy: {
      confidence?: number;
      fieldAccuracy?: Record<string, number>;
    } = {}
  ): void {
    this.mockResponses.set(documentType, response);
    if (accuracy.confidence) {
      this.confidenceScores.set(documentType, accuracy.confidence);
    }
  }

  /**
   * Configure error scenarios for testing
   */
  public setMockError(
    documentType: DocumentType,
    error: Error,
    conditions?: {
      networkCondition?: keyof typeof MOCK_NETWORK_CONDITIONS;
      probability?: number;
    }
  ): void {
    if (conditions?.probability && Math.random() > conditions.probability) {
      return;
    }
    this.errorScenarios.set(documentType, error);
  }

  /**
   * Reset all mock configurations
   */
  public reset(): void {
    this.mockResponses.clear();
    this.jobStatuses.clear();
    this.confidenceScores.clear();
    this.errorScenarios.clear();
    MOCK_SUPPORTED_DOCUMENT_TYPES.forEach(type => {
      this.setDefaultResponse(type, 95);
    });
  }

  /**
   * Set default response template for document type
   */
  private setDefaultResponse(type: DocumentType, confidence: number): void {
    const response = this.getDefaultResponse(type);
    this.mockResponses.set(type, response);
    this.confidenceScores.set(type, confidence);
  }

  /**
   * Get default response template based on document type
   */
  private getDefaultResponse(type: DocumentType): object {
    const baseResponse = {
      DocumentMetadata: {
        Pages: 1
      },
      Blocks: []
    };

    switch (type) {
      case DocumentType.ID_DOCUMENT:
        return {
          ...baseResponse,
          Blocks: [
            { BlockType: 'LINE', Text: 'ID Number: 123456789', Confidence: 95 },
            { BlockType: 'LINE', Text: 'Name: John Doe', Confidence: 98 },
            { BlockType: 'LINE', Text: 'Date of Birth: 1990-01-01', Confidence: 96 }
          ]
        };

      case DocumentType.PROOF_OF_ADDRESS:
        return {
          ...baseResponse,
          Blocks: [
            { BlockType: 'LINE', Text: 'Street: 123 Main St', Confidence: 97 },
            { BlockType: 'LINE', Text: 'City: São Paulo', Confidence: 98 },
            { BlockType: 'LINE', Text: 'ZIP: 12345-678', Confidence: 95 }
          ]
        };

      case DocumentType.HEALTH_DECLARATION:
        return {
          ...baseResponse,
          Blocks: [
            { BlockType: 'LINE', Text: 'Patient Name: John Doe', Confidence: 98 },
            { BlockType: 'LINE', Text: 'Health Conditions: None', Confidence: 96 },
            { BlockType: 'LINE', Text: 'Medications: None', Confidence: 97 }
          ]
        };

      default:
        return baseResponse;
    }
  }

  /**
   * Apply confidence score to response blocks
   */
  private applyConfidenceScore(response: any, confidence: number): object {
    const confidenceMultiplier = confidence / 100;
    
    if (response.Blocks) {
      response.Blocks = response.Blocks.map((block: any) => ({
        ...block,
        Confidence: Math.min(100, block.Confidence * confidenceMultiplier)
      }));
    }

    return response;
  }
}