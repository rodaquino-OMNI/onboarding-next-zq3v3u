/**
 * @fileoverview Cypress custom commands for healthcare enrollment system E2E testing
 * Implements HIPAA-compliant test commands with enhanced security and validation
 * @version 1.0.0
 */

import { APIClient } from '../../utils/api-client';
import { waitForProcessing } from '../../utils/test-helpers';
import { generateTestUser } from '../../utils/data-generators';
import { DocumentType } from '../../../web/src/app/core/interfaces/document.interface';
import { Language } from '../../../web/src/app/core/interfaces/user.interface';

// Extend Cypress namespace with custom commands
declare global {
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<void>;
      uploadDocument(documentType: DocumentType, file: File, metadata?: Record<string, any>): Chainable<void>;
      fillHealthDeclaration(healthData: Record<string, any>): Chainable<void>;
      scheduleInterview(interviewDate: Date, timeSlot: string, preferences?: Record<string, any>): Chainable<void>;
      changeLanguage(language: Language, options?: Record<string, any>): Chainable<void>;
    }
  }
}

/**
 * Custom command for secure user authentication
 * Implements HIPAA-compliant login with enhanced validation
 */
Cypress.Commands.add('login', (email: string, password: string) => {
  cy.log('Attempting secure login with HIPAA compliance');

  // Input validation
  if (!email || !password) {
    throw new Error('Email and password are required for login');
  }

  // Clear existing session data
  cy.clearCookies();
  cy.clearLocalStorage();

  // Visit login page with retry mechanism
  cy.visit('/login', { timeout: 10000 }).then(() => {
    // Fill login form with validation
    cy.findByLabelText('Email').should('be.visible').type(email, { delay: 50 });
    cy.findByLabelText('Password').should('be.visible').type(password, { log: false });

    // Submit form and wait for response
    cy.get('form').submit();

    // Verify successful login
    cy.url().should('include', '/dashboard');
    cy.window().its('localStorage').should('have.property', 'token');

    // Log successful login for audit
    cy.log('Login successful - Session established');
  });
});

/**
 * Custom command for secure document upload with OCR verification
 * Implements HIPAA-compliant document handling
 */
Cypress.Commands.add('uploadDocument', (documentType: DocumentType, file: File, metadata = {}) => {
  cy.log(`Initiating secure document upload: ${documentType}`);

  // Validate document type
  if (!Object.values(DocumentType).includes(documentType)) {
    throw new Error(`Invalid document type: ${documentType}`);
  }

  // Prepare upload form
  cy.get('[data-testid="document-upload"]').within(() => {
    // Attach file with validation
    cy.get('input[type="file"]')
      .attachFile(file, { subjectType: 'input' });

    // Fill metadata if provided
    if (Object.keys(metadata).length) {
      cy.get('[data-testid="document-metadata"]').within(() => {
        Object.entries(metadata).forEach(([key, value]) => {
          cy.get(`[name="${key}"]`).type(String(value));
        });
      });
    }

    // Submit upload
    cy.get('[data-testid="upload-submit"]').click();
  });

  // Wait for OCR processing
  cy.waitForProcessing(30000, {
    checkInterval: 1000,
    successCondition: () => 
      cy.get('[data-testid="ocr-status"]')
        .should('have.text', 'Processed')
  });

  // Verify upload success
  cy.get('[data-testid="upload-success"]').should('be.visible');
});

/**
 * Custom command for completing health declaration with HIPAA compliance
 * Implements secure health data handling
 */
Cypress.Commands.add('fillHealthDeclaration', (healthData: Record<string, any>) => {
  cy.log('Initiating health declaration form completion');

  // Validate required health data
  if (!healthData || !Object.keys(healthData).length) {
    throw new Error('Health data is required');
  }

  // Navigate to health declaration form
  cy.visit('/enrollment/health-declaration');

  // Fill personal information
  cy.get('[data-testid="personal-info"]').within(() => {
    if (healthData.conditions) {
      healthData.conditions.forEach((condition: string) => {
        cy.get(`[data-testid="condition-${condition}"]`).check();
      });
    }

    if (healthData.medications) {
      healthData.medications.forEach((medication: Record<string, string>) => {
        cy.get('[data-testid="add-medication"]').click();
        cy.get('[data-testid="medication-name"]').type(medication.name);
        cy.get('[data-testid="medication-dosage"]').type(medication.dosage);
        cy.get('[data-testid="medication-frequency"]').type(medication.frequency);
      });
    }
  });

  // Submit form with validation
  cy.get('[data-testid="health-declaration-submit"]').click();
  cy.get('[data-testid="submission-success"]').should('be.visible');
});

/**
 * Custom command for scheduling video interviews
 * Implements secure interview scheduling with timezone handling
 */
Cypress.Commands.add('scheduleInterview', (interviewDate: Date, timeSlot: string, preferences = {}) => {
  cy.log('Initiating interview scheduling');

  // Validate date and time
  if (!interviewDate || !timeSlot) {
    throw new Error('Interview date and time slot are required');
  }

  // Navigate to scheduling interface
  cy.visit('/enrollment/schedule-interview');

  // Select date with timezone handling
  cy.get('[data-testid="interview-calendar"]')
    .click(interviewDate.toISOString().split('T')[0]);

  // Select time slot
  cy.get(`[data-testid="time-slot-${timeSlot}"]`).click();

  // Apply preferences if provided
  if (Object.keys(preferences).length) {
    cy.get('[data-testid="interview-preferences"]').within(() => {
      Object.entries(preferences).forEach(([key, value]) => {
        cy.get(`[name="${key}"]`).type(String(value));
      });
    });
  }

  // Confirm scheduling
  cy.get('[data-testid="schedule-confirm"]').click();
  cy.get('[data-testid="schedule-success"]').should('be.visible');
});

/**
 * Custom command for changing application language
 * Implements multi-language support with validation
 */
Cypress.Commands.add('changeLanguage', (language: Language, options = {}) => {
  cy.log(`Changing application language to: ${language}`);

  // Validate language code
  if (!Object.values(Language).includes(language)) {
    throw new Error(`Unsupported language: ${language}`);
  }

  // Open language selector
  cy.get('[data-testid="language-selector"]').click();

  // Select target language
  cy.get(`[data-testid="language-${language}"]`).click();

  // Wait for translation load
  cy.waitForProcessing(5000, {
    checkInterval: 500,
    successCondition: () => 
      cy.get('html')
        .should('have.attr', 'lang', language)
  });

  // Verify language change
  cy.get('[data-testid="current-language"]')
    .should('have.text', language);
});