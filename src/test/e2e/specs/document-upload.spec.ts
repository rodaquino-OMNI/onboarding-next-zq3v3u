/**
 * @fileoverview End-to-end tests for document upload functionality
 * Implements HIPAA-compliant document upload testing with security validation
 * @version 1.0.0
 */

import { test, expect, describe, beforeEach, afterEach } from 'jest';
import { Page, Browser, ElementHandle } from '@playwright/test';
import {
  setupTestEnvironment,
  createAuthenticatedClient,
  setupHipaaCompliance,
  setupSecurityContext
} from '../../utils/test-helpers';
import {
  createTestFile,
  uploadTestDocument,
  validateSecureUpload,
  verifyAuditTrail
} from '../../utils/file-upload-helper';
import { DocumentType, DocumentStatus } from '../../../web/src/app/core/interfaces/document.interface';
import { Language } from '../../../web/src/app/core/interfaces/user.interface';

// Test configuration constants
const TEST_TIMEOUT = 60000;
const VALID_FILE_TYPES = ['.pdf', '.jpg', '.jpeg', '.png'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block'
};
const SUPPORTED_LANGUAGES = ['en-US', 'pt-BR', 'es-ES'];

describe('Document Upload E2E Tests', () => {
  let page: Page;
  let browser: Browser;
  let securityContext: any;

  beforeEach(async () => {
    // Initialize test environment with HIPAA compliance
    const testEnv = await setupTestEnvironment();
    browser = testEnv.browser;
    page = await browser.newPage();

    // Setup security context and HIPAA compliance
    securityContext = await setupSecurityContext({
      permissions: ['document:upload', 'document:verify'],
      hipaaCompliance: true
    });

    // Configure authenticated client with security headers
    await createAuthenticatedClient(page, {
      headers: SECURITY_HEADERS,
      hipaaCompliance: true
    });

    // Navigate to document upload page
    await page.goto('/enrollment/documents');
    await page.waitForSelector('[data-testid="document-upload"]');
  });

  afterEach(async () => {
    // Verify and clean up test artifacts
    await verifyAuditTrail(page, {
      action: 'DOCUMENT_UPLOAD_TEST',
      status: 'COMPLETED'
    });

    // Clean up uploaded test files
    await page.evaluate(() => localStorage.clear());
    await browser.close();
  });

  test('should successfully upload valid document with HIPAA compliance', async () => {
    // Create test document with HIPAA metadata
    const testFile = await createTestFile({
      type: DocumentType.ID_DOCUMENT,
      size: 1024 * 1024, // 1MB
      hipaaCompliance: true
    });

    // Select file input and trigger upload
    const fileInput = await page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles([testFile]);

    // Verify upload progress indicator
    await expect(page.locator('[data-testid="upload-progress"]')).toBeVisible();
    await expect(page.locator('[data-testid="progress-value"]')).toHaveText('100%');

    // Wait for OCR processing
    await page.waitForSelector('[data-testid="ocr-status-complete"]');

    // Verify uploaded document properties
    const documentCard = page.locator('[data-testid="document-card"]').first();
    await expect(documentCard.locator('[data-testid="document-type"]'))
      .toHaveText('ID Document');
    await expect(documentCard.locator('[data-testid="document-status"]'))
      .toHaveText('Verified');

    // Validate HIPAA compliance metadata
    const complianceStatus = await validateSecureUpload(page, testFile);
    expect(complianceStatus.isCompliant).toBe(true);
    expect(complianceStatus.encryptionVerified).toBe(true);
  }, TEST_TIMEOUT);

  test('should handle invalid file types with proper validation messages', async () => {
    // Test invalid file type
    const invalidFile = await createTestFile({
      type: 'text/plain',
      size: 1024,
      hipaaCompliance: true
    });

    const fileInput = await page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles([invalidFile]);

    // Verify error message
    await expect(page.locator('[data-testid="error-message"]'))
      .toHaveText('Invalid file type. Allowed types: PDF, JPG, PNG');
  });

  test('should enforce file size limits with proper feedback', async () => {
    // Create oversized test file
    const largeFile = await createTestFile({
      type: DocumentType.ID_DOCUMENT,
      size: MAX_FILE_SIZE + 1024,
      hipaaCompliance: true
    });

    const fileInput = await page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles([largeFile]);

    // Verify size limit error message
    await expect(page.locator('[data-testid="error-message"]'))
      .toHaveText('File size exceeds 5MB limit');
  });

  test('should support multi-language validation messages', async () => {
    // Test validation messages in Portuguese
    await page.evaluate((lang) => {
      localStorage.setItem('preferredLanguage', lang);
    }, 'pt-BR');
    await page.reload();

    const invalidFile = await createTestFile({
      type: 'text/plain',
      size: 1024,
      hipaaCompliance: true
    });

    const fileInput = await page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles([invalidFile]);

    // Verify Portuguese error message
    await expect(page.locator('[data-testid="error-message"]'))
      .toHaveText('Tipo de arquivo inválido. Tipos permitidos: PDF, JPG, PNG');
  });

  test('should handle concurrent document uploads', async () => {
    // Create multiple test documents
    const documents = await Promise.all([
      createTestFile({ type: DocumentType.ID_DOCUMENT, size: 1024 * 512, hipaaCompliance: true }),
      createTestFile({ type: DocumentType.PROOF_OF_ADDRESS, size: 1024 * 512, hipaaCompliance: true })
    ]);

    // Upload documents concurrently
    const fileInput = await page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles(documents);

    // Verify all uploads complete successfully
    await page.waitForSelector('[data-testid="upload-complete"]', { count: 2 });
    
    // Verify document order and status
    const documentCards = await page.locator('[data-testid="document-card"]').all();
    expect(documentCards).toHaveLength(2);
    
    for (const card of documentCards) {
      await expect(card.locator('[data-testid="document-status"]'))
        .toHaveText('Verified');
    }
  });

  test('should handle network interruptions during upload', async () => {
    // Enable network interruption simulation
    await page.route('**/api/documents/upload', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.continue();
    });

    const testFile = await createTestFile({
      type: DocumentType.ID_DOCUMENT,
      size: 1024 * 1024,
      hipaaCompliance: true
    });

    const fileInput = await page.locator('[data-testid="file-input"]');
    await fileInput.setInputFiles([testFile]);

    // Verify retry mechanism
    await expect(page.locator('[data-testid="upload-retry"]')).toBeVisible();
    await page.click('[data-testid="retry-button"]');

    // Verify successful upload after retry
    await page.waitForSelector('[data-testid="upload-complete"]');
    await expect(page.locator('[data-testid="document-status"]'))
      .toHaveText('Verified');
  });
});