/**
 * @fileoverview End-to-end test suite for health declaration form functionality
 * Implements HIPAA-compliant testing with accessibility and multi-language support
 * @version 1.0.0
 */

import { test, expect, describe, beforeEach, afterEach } from 'jest';
import { Page, Browser, chromium, accessibility } from '@playwright/test';
import { enrollments } from '../../fixtures/enrollments.json';
import {
  setupTestEnvironment,
  createAuthenticatedClient,
  waitForAsyncOperation,
  validateAccessibility
} from '../../utils/test-helpers';
import { EnrollmentStatus } from '../../../web/src/app/core/interfaces/enrollment.interface';
import { Language } from '../../../web/src/app/core/interfaces/user.interface';

// Test configuration constants
const HEALTH_DECLARATION_URL = '/enrollment/health-declaration';
const TIMEOUT = 30000;
const ACCESSIBILITY_STANDARDS = ['WCAG2.1', 'Section508'];

describe('Health Declaration Form E2E Tests', () => {
  let browser: Browser;
  let page: Page;
  let testEnv: any;

  beforeEach(async () => {
    // Setup test environment with HIPAA compliance
    testEnv = await setupTestEnvironment({
      cleanupEnabled: true,
      timeouts: { setup: 10000 }
    });

    // Launch browser with security headers
    browser = await chromium.launch({
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--ignore-certificate-errors'
      ]
    });

    // Create isolated page context
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 720 },
      locale: 'en-US'
    });

    page = await context.newPage();

    // Set up performance monitoring
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.coverage.startJSCoverage();
    await page.coverage.startCSSCoverage();

    // Navigate to health declaration page
    await page.goto(HEALTH_DECLARATION_URL);
  });

  afterEach(async () => {
    // Collect coverage data
    const jsCoverage = await page.coverage.stopJSCoverage();
    const cssCoverage = await page.coverage.stopCSSCoverage();

    // Clean up test data securely
    await testEnv.cleanup();

    // Close browser
    await browser.close();
  });

  test('should render health declaration form with WCAG compliance', async () => {
    // Verify form structure and accessibility
    await expect(page.locator('h1')).toHaveText('Health Declaration Form');
    await expect(page.locator('[role="form"]')).toBeVisible();

    // Validate ARIA labels and roles
    const formSection = page.locator('form[aria-label="Health Declaration Form"]');
    await expect(formSection).toHaveAttribute('role', 'form');
    await expect(formSection).toHaveAttribute('aria-required', 'true');

    // Check accessibility compliance
    const accessibilityReport = await validateAccessibility(page, ACCESSIBILITY_STANDARDS);
    expect(accessibilityReport.violations).toHaveLength(0);
  });

  test('should validate required fields with medical terminology', async () => {
    // Attempt to submit empty form
    await page.click('button[type="submit"]');

    // Verify validation messages
    const errorMessages = page.locator('.error-message');
    await expect(errorMessages).toHaveCount(4); // Required sections

    // Validate medical condition fields
    const conditionSection = page.locator('#medical-conditions');
    await expect(conditionSection).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#conditions-error')).toBeVisible();
  });

  test('should handle medical conditions with proper PHI protection', async () => {
    // Fill medical conditions
    await page.click('#add-condition');
    await page.fill('#condition-name', 'Hypertension');
    await page.click('#condition-diagnosed-date');
    await page.fill('#condition-diagnosed-date', '2023-01-01');

    // Verify PHI warning
    await expect(page.locator('.phi-warning')).toBeVisible();
    await expect(page.locator('.phi-warning')).toContainText('Protected Health Information');

    // Submit condition
    await page.click('#save-condition');
    await expect(page.locator('.condition-list')).toContainText('Hypertension');
  });

  test('should manage medication list with interaction checks', async () => {
    // Add medication
    await page.click('#add-medication');
    await page.fill('#medication-name', 'Lisinopril');
    await page.fill('#medication-dosage', '10mg');
    await page.selectOption('#frequency', 'daily');

    // Verify drug interaction check
    await waitForAsyncOperation(async () => {
      const interactionCheck = await page.locator('#interaction-check');
      return await interactionCheck.isVisible();
    });

    // Submit medication
    await page.click('#save-medication');
    await expect(page.locator('.medication-list')).toContainText('Lisinopril');
  });

  test('should submit valid health declaration securely', async () => {
    // Fill all required fields
    await page.fill('#height', '175');
    await page.fill('#weight', '70');
    await page.click('#no-smoking');
    await page.click('#no-alcohol');

    // Add medical history
    await page.click('#no-previous-conditions');
    await page.click('#no-surgeries');
    await page.click('#no-allergies');

    // Submit form
    await page.click('button[type="submit"]');

    // Verify submission and encryption
    await waitForAsyncOperation(async () => {
      const successMessage = await page.locator('.success-message');
      return await successMessage.isVisible();
    });

    // Verify enrollment status update
    const enrollment = await testEnv.apiClient.getEnrollment();
    expect(enrollment.status).toBe(EnrollmentStatus.HEALTH_DECLARATION_PENDING);
  });

  test('should support multiple languages with medical terms', async () => {
    // Test Portuguese language
    await page.selectOption('#language-selector', Language.Portuguese);

    // Verify translated medical terms
    await expect(page.locator('#medical-conditions-label')).toHaveText('Condições Médicas');
    await expect(page.locator('#medications-label')).toHaveText('Medicamentos');

    // Verify form submission in Portuguese
    await page.fill('#height', '175');
    await page.fill('#weight', '70');
    await page.click('#no-smoking');
    await page.click('button[type="submit"]');

    // Verify validation messages in Portuguese
    const errorMessage = await page.locator('.error-message').first();
    await expect(errorMessage).toContainText('obrigatório');
  });

  test('should preserve form state with encryption', async () => {
    // Fill partial form
    await page.fill('#height', '175');
    await page.fill('#weight', '70');
    await page.click('#no-smoking');

    // Save draft
    await page.click('#save-draft');

    // Reload page
    await page.reload();

    // Verify form state preservation
    await expect(page.locator('#height')).toHaveValue('175');
    await expect(page.locator('#weight')).toHaveValue('70');
    await expect(page.locator('#no-smoking')).toBeChecked();
  });

  test('should handle secure file attachments', async () => {
    // Upload medical record
    const filePath = 'test-files/medical-record.pdf';
    await page.setInputFiles('input[type="file"]', filePath);

    // Verify file encryption
    await waitForAsyncOperation(async () => {
      const uploadStatus = await page.locator('#upload-status');
      return await uploadStatus.textContent() === 'Encrypted and uploaded';
    });

    // Verify file preview
    await expect(page.locator('#file-preview')).toBeVisible();
    await expect(page.locator('#file-preview')).toContainText('medical-record.pdf');
  });

  test('should integrate with enrollment workflow securely', async () => {
    // Complete health declaration
    await page.fill('#height', '175');
    await page.fill('#weight', '70');
    await page.click('#no-smoking');
    await page.click('#no-alcohol');
    await page.click('#no-previous-conditions');
    await page.click('#no-surgeries');
    await page.click('#no-allergies');

    // Submit form
    await page.click('button[type="submit"]');

    // Verify workflow integration
    await waitForAsyncOperation(async () => {
      const enrollment = await testEnv.apiClient.getEnrollment();
      return enrollment.status === EnrollmentStatus.HEALTH_DECLARATION_PENDING;
    });

    // Verify audit trail
    const auditLog = await testEnv.apiClient.getAuditLog();
    expect(auditLog).toContainEqual(expect.objectContaining({
      action: 'HEALTH_DECLARATION_SUBMITTED',
      status: 'SUCCESS'
    }));
  });
});