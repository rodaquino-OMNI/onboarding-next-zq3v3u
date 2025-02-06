/**
 * @fileoverview Document management interfaces and types for healthcare enrollment
 * Implements HIPAA-compliant document handling with encryption and secure storage
 * @version 1.0.0
 */

// External imports
import { UUID } from 'crypto'; // v20.0.0+

/**
 * Core interface for healthcare document management with HIPAA compliance
 * Implements secure document handling with encryption and audit trails
 */
export interface Document {
  /** Unique document identifier */
  id: UUID;
  
  /** Reference to associated enrollment */
  enrollmentId: UUID;
  
  /** Document classification type */
  type: DocumentType;
  
  /** Encrypted storage location */
  storagePath: string;
  
  /** Document encryption key identifier */
  encryptionKey: string;
  
  /** OCR processing results */
  ocrData: OcrResult;
  
  /** Current document processing status */
  status: DocumentStatus;
  
  /** Timestamp of OCR processing completion */
  processedAt: Date;
  
  /** User ID who verified the document */
  verifiedBy: UUID;
  
  /** Timestamp of document verification */
  verifiedAt: Date;
  
  /** Document retention period in days */
  retentionPeriod: number;
  
  /** Document creation timestamp */
  createdAt: Date;
  
  /** Last modification timestamp */
  updatedAt: Date;
}

/**
 * Supported healthcare document types
 * Extensible enumeration for document classification
 */
export enum DocumentType {
  ID_DOCUMENT = 'ID_DOCUMENT',
  PROOF_OF_ADDRESS = 'PROOF_OF_ADDRESS',
  HEALTH_DECLARATION = 'HEALTH_DECLARATION',
  MEDICAL_RECORD = 'MEDICAL_RECORD',
  INSURANCE_CARD = 'INSURANCE_CARD',
  LAB_RESULT = 'LAB_RESULT'
}

/**
 * Document processing and verification statuses
 * Tracks document lifecycle with compliance states
 */
export enum DocumentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED'
}

/**
 * OCR processing results with PHI detection
 * Contains extracted data and validation results
 */
export interface OcrResult {
  /** OCR confidence score (0-100) */
  confidence: number;
  
  /** Raw extracted text content */
  extractedText: string;
  
  /** Structured extracted field data */
  fields: Record<string, string>;
  
  /** Validation error messages */
  validationErrors: string[];
  
  /** Indicates presence of sensitive PHI data */
  sensitiveDataFound: boolean;
  
  /** Additional processing metadata */
  processingMetadata: Record<string, any>;
}

/**
 * Secure document upload response
 * Provides temporary access credentials and encryption details
 */
export interface DocumentUploadResponse {
  /** Created document metadata */
  document: Document;
  
  /** Temporary upload URL */
  uploadUrl: string;
  
  /** Upload URL expiration timestamp */
  expiresAt: Date;
  
  /** Document encryption configuration */
  encryptionDetails: Record<string, string>;
  
  /** Required upload request headers */
  requiredHeaders: Record<string, string>;
}