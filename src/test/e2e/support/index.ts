/**
 * @fileoverview Main configuration and setup file for Cypress end-to-end tests
 * Implements HIPAA-compliant testing infrastructure with security features
 * @version 1.0.0
 */

import './commands';
import '@testing-library/cypress/add-commands';
import '@cypress/xpath';
import { AuditLogger } from 'cypress-audit-logger';
import { waitForAsyncOperation } from '../../utils/test-helpers';
import { Language } from '../../../web/src/app/core/interfaces/user.interface';
import { DocumentType } from '../../../web/src/app/core/interfaces/document.interface';

// Configure Cypress with enhanced security settings
Cypress.config({
  baseUrl: 'http://localhost:4200',
  defaultCommandTimeout: 10000,
  requestTimeout: 15000,
  responseTimeout: 15000,
  viewportWidth: 1280,
  viewportHeight: 720,
  video: true,
  videoCompression: 32,
  screenshotOnRunFailure: true,
  chromeWebSecurity: true,
  experimentalSessionAndOrigin: true
});

// Configure environment variables with security defaults
Cypress.env({
  API_URL: 'http://localhost:8000/api/v1',
  DEFAULT_USER_PASSWORD: 'TestPass123!',
  UPLOAD_FILE_MAX_SIZE: 5242880, // 5MB
  ENCRYPTION_KEY: process.env.TEST_ENCRYPTION_KEY,
  HIPAA_COMPLIANCE_MODE: true,
  AUDIT_LOGGING_ENABLED: true,
  PHI_MASKING_ENABLED: true,
  TEST_DATA_RETENTION_DAYS: 7
});

// Initialize audit logger for HIPAA compliance
const auditLogger = new AuditLogger({
  enabled: Cypress.env('AUDIT_LOGGING_ENABLED'),
  logDirectory: 'cypress/logs/audit',
  maskSensitiveData: true
});

/**
 * Enhanced global setup before each test with HIPAA compliance measures
 */
beforeEach(() => {
  // Clear existing session data
  cy.clearCookies();
  cy.clearLocalStorage();

  // Configure security headers for requests
  cy.intercept('*', (req) => {
    req.headers['X-HIPAA-Compliance'] = 'enabled';
    req.headers['X-Security-Context'] = 'test';
    req.headers['X-Request-ID'] = `test-${Date.now()}`;
  });

  // Verify security configuration
  cy.wrap(Cypress.config()).should('deep.include', {
    chromeWebSecurity: true,
    experimentalSessionAndOrigin: true
  });

  // Initialize PHI tracking
  if (Cypress.env('PHI_MASKING_ENABLED')) {
    cy.window().then((win) => {
      win.localStorage.setItem('PHI_TRACKING', 'enabled');
    });
  }

  // Log test initialization
  auditLogger.log({
    event: 'TEST_INITIALIZED',
    timestamp: new Date().toISOString(),
    metadata: {
      testFile: Cypress.spec.name,
      browser: Cypress.browser.name,
      viewport: `${Cypress.config('viewportWidth')}x${Cypress.config('viewportHeight')}`
    }
  });
});

/**
 * Enhanced global cleanup after each test with secure data handling
 */
afterEach(() => {
  // Clean up sensitive test data
  cy.window().then((win) => {
    win.localStorage.removeItem('token');
    win.localStorage.removeItem('user');
    win.sessionStorage.clear();
  });

  // Reset mocked responses
  cy.intercept('*', (req) => {
    delete req.headers['X-HIPAA-Compliance'];
    delete req.headers['X-Security-Context'];
  });

  // Log test completion
  auditLogger.log({
    event: 'TEST_COMPLETED',
    timestamp: new Date().toISOString(),
    metadata: {
      testFile: Cypress.spec.name,
      status: (Cypress as any).state('test').state,
      duration: (Cypress as any).state('test').duration
    }
  });
});

// Type definitions for custom commands
declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Custom command for secure login with HIPAA compliance
       */
      login(email: string, password: string): Chainable<void>;

      /**
       * Custom command for secure document upload with OCR verification
       */
      uploadDocument(
        documentType: DocumentType,
        file: string,
        metadata?: Record<string, any>
      ): Chainable<void>;

      /**
       * Custom command for completing health declaration with PHI handling
       */
      fillHealthDeclaration(
        healthData: Record<string, any>
      ): Chainable<void>;

      /**
       * Custom command for scheduling video interviews
       */
      scheduleInterview(
        date: Date,
        timeSlot: string,
        preferences?: Record<string, any>
      ): Chainable<void>;

      /**
       * Custom command for changing application language
       */
      changeLanguage(
        language: Language,
        options?: Record<string, any>
      ): Chainable<void>;

      /**
       * Custom command for masking PHI data in tests
       */
      maskPHI(
        data: Record<string, any>,
        fields: string[]
      ): Chainable<Record<string, any>>;

      /**
       * Custom command for verifying HIPAA compliance
       */
      verifyHIPAACompliance(): Chainable<void>;
    }
  }
}

// Export configured Cypress instance
export default Cypress;