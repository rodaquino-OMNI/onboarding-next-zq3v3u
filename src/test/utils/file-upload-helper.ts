/**
 * @fileoverview Test utilities for HIPAA-compliant file upload functionality
 * Implements secure file upload testing with OCR validation and audit trails
 * @version 1.0.0
 */

import { Document, DocumentType, HIPAACompliance } from '../../web/src/app/core/interfaces/document.interface';
import { mockApiResponse, SecurityContext } from './test-helpers';
import i18next from 'i18next';
import jest from 'jest';

// Allowed MIME types per document type with security validation
const ALLOWED_MIME_TYPES: Record<DocumentType, string[]> = {
  [DocumentType.ID_DOCUMENT]: ['image/jpeg', 'image/png', 'application/pdf'],
  [DocumentType.PROOF_OF_ADDRESS]: ['image/jpeg', 'image/png', 'application/pdf'],
  [DocumentType.HEALTH_DECLARATION]: ['application/pdf'],
  [DocumentType.MEDICAL_RECORD]: ['application/pdf'],
  [DocumentType.INSURANCE_CARD]: ['image/jpeg', 'image/png', 'application/pdf'],
  [DocumentType.LAB_RESULT]: ['application/pdf']
};

// File size limits and security configurations
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const SECURITY_VALIDATION_RULES = {
  contentValidation: true,
  malwareScanning: true,
  metadataValidation: true,
  encryptionRequired: true,
  auditTrailRequired: true
};

// HIPAA compliance metadata requirements
const HIPAA_COMPLIANCE_METADATA = {
  requiredFields: ['patientId', 'documentType', 'timestamp'],
  encryptionRequired: true,
  auditRequired: true,
  retentionPeriod: 365 // days
};

/**
 * Creates a mock File object with HIPAA compliance metadata for testing
 * @param fileName - Name of the file
 * @param mimeType - MIME type of the file
 * @param size - Size in bytes
 * @param complianceMetadata - HIPAA compliance metadata
 * @returns Mock File object with compliance metadata
 */
export function createMockFile(
  fileName: string,
  mimeType: string,
  size: number,
  complianceMetadata: HIPAACompliance
): File {
  // Validate input parameters
  if (!fileName || !mimeType || size <= 0) {
    throw new Error('Invalid file parameters');
  }

  // Create mock file content
  const content = new Array(size).fill('0').join('');
  const blob = new Blob([content], { type: mimeType });

  // Create File object with metadata
  const file = new File([blob], fileName, {
    type: mimeType,
    lastModified: Date.now()
  });

  // Add HIPAA compliance metadata
  Object.defineProperty(file, 'hipaaMetadata', {
    value: {
      ...complianceMetadata,
      timestamp: new Date().toISOString(),
      auditTrail: {
        createdAt: new Date().toISOString(),
        createdBy: 'test-user',
        action: 'FILE_CREATION'
      }
    },
    enumerable: true
  });

  return file;
}

/**
 * Simulates a secure file upload process with HIPAA compliance
 * @param file - File to upload
 * @param documentType - Type of document being uploaded
 * @param securityContext - Security context for validation
 * @returns Promise resolving to uploaded document
 */
export async function simulateFileUpload(
  file: File,
  documentType: DocumentType,
  securityContext: SecurityContext
): Promise<Document> {
  // Validate file type and size
  const isValidType = await validateFileType(file.type, documentType, securityContext);
  if (!isValidType) {
    throw new Error(i18next.t('errors.invalidFileType', { type: file.type }));
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(i18next.t('errors.fileTooLarge', { maxSize: MAX_FILE_SIZE / 1024 / 1024 }));
  }

  // Simulate security validation
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Simulate malware scanning
  const malwareScanResult = await simulateMalwareScan(file);
  if (!malwareScanResult.safe) {
    throw new Error(i18next.t('errors.malwareDetected'));
  }

  // Simulate upload progress
  const progressEvent = new CustomEvent('upload-progress', {
    detail: { loaded: file.size, total: file.size }
  });
  window.dispatchEvent(progressEvent);

  // Simulate OCR processing delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Generate mock document response
  return mockApiResponse<Document>({
    id: 'test-doc-' + Date.now(),
    enrollmentId: 'test-enrollment',
    type: documentType,
    storagePath: `documents/${documentType}/${file.name}`,
    encryptionKey: 'test-key-' + Date.now(),
    ocrData: {
      confidence: 95,
      extractedText: 'Sample extracted text',
      fields: {},
      validationErrors: [],
      sensitiveDataFound: true,
      processingMetadata: {
        processingTime: 850,
        processingServer: 'test-ocr-1'
      }
    },
    status: 'PROCESSED',
    processedAt: new Date(),
    verifiedBy: securityContext.userId,
    verifiedAt: new Date(),
    retentionPeriod: HIPAA_COMPLIANCE_METADATA.retentionPeriod,
    createdAt: new Date(),
    updatedAt: new Date()
  });
}

/**
 * Validates file type with security checks
 * @param mimeType - MIME type to validate
 * @param documentType - Expected document type
 * @param securityContext - Security context for validation
 * @returns Promise resolving to validation result
 */
export async function validateFileType(
  mimeType: string,
  documentType: DocumentType,
  securityContext: SecurityContext
): Promise<boolean> {
  // Check if mime type is allowed for document type
  if (!ALLOWED_MIME_TYPES[documentType].includes(mimeType)) {
    return false;
  }

  // Simulate deep content inspection
  await new Promise(resolve => setTimeout(resolve, 300));

  // Validate security context
  if (!securityContext.permissions.includes('document:upload')) {
    throw new Error(i18next.t('errors.insufficientPermissions'));
  }

  return true;
}

/**
 * Creates a mock file upload event with security context
 * @param file - File to include in event
 * @param securityContext - Security context for validation
 * @param complianceMetadata - HIPAA compliance metadata
 * @returns Mock upload event
 */
export function createUploadEvent(
  file: File,
  securityContext: SecurityContext,
  complianceMetadata: HIPAACompliance
): Event {
  const event = new Event('change', { bubbles: true });

  // Create mock FileList
  const fileList = {
    0: file,
    length: 1,
    item: (index: number) => index === 0 ? file : null
  };

  // Add security context and compliance metadata
  Object.defineProperty(event, 'target', {
    value: {
      files: fileList,
      securityContext,
      hipaaCompliance: complianceMetadata
    },
    enumerable: true
  });

  return event;
}

/**
 * Simulates malware scanning process
 * @param file - File to scan
 * @returns Promise resolving to scan result
 */
async function simulateMalwareScan(file: File): Promise<{ safe: boolean; threats: string[] }> {
  await new Promise(resolve => setTimeout(resolve, 700));
  
  // Simulate threat detection for files containing 'malware' in name
  const hasMalware = file.name.toLowerCase().includes('malware');
  
  return {
    safe: !hasMalware,
    threats: hasMalware ? ['SIMULATED_THREAT'] : []
  };
}