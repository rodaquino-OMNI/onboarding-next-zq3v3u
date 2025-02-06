import { axe, Result, Spec } from 'axe-core';
import { mount } from 'cypress/react';
import { axeConfiguration } from '../../accessibility/axe-config.json';
import { setupTestEnvironment } from '../../utils/test-helpers';
import { Language } from '../../../web/src/app/core/interfaces/user.interface';
import { EnrollmentStatus } from '../../../web/src/app/core/interfaces/enrollment.interface';

// Viewport configurations for responsive testing
const VIEWPORT_SIZES = {
  mobile: { width: 320, height: 568 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1920, height: 1080 }
};

// Test routes
const TEST_ROUTES = {
  enrollment: '/enrollment',
  documents: '/documents',
  interview: '/interview',
  healthDeclaration: '/health-declaration'
};

// Medical terminology assets
const MEDICAL_TERMS = {
  dictionary: '/assets/medical-terms.json',
  pronunciations: '/assets/pronunciations.json'
};

describe('Healthcare Platform Accessibility Tests', () => {
  beforeEach(() => {
    // Initialize test environment with accessibility configuration
    cy.injectAxe();
    cy.configureAxe({
      ...axeConfiguration,
      rules: [
        ...axeConfiguration.rules,
        {
          id: 'medical-terms-pronunciation',
          enabled: true
        }
      ]
    });

    // Set up test environment with healthcare-specific configurations
    setupTestEnvironment({
      cleanupEnabled: true,
      timeouts: { setup: 10000 }
    });
  });

  describe('Enrollment Form Accessibility', () => {
    it('should meet WCAG 2.1 AA standards for enrollment form', () => {
      cy.visit(TEST_ROUTES.enrollment);
      
      // Test form structure and landmarks
      cy.get('[role="form"]')
        .should('have.attr', 'aria-labelledby')
        .and('have.attr', 'aria-describedby');

      // Verify medical form field groups
      cy.get('[role="group"][aria-label="Personal Information"]')
        .should('exist')
        .and('have.attr', 'aria-required', 'true');

      // Test medical terminology pronunciation
      cy.get('[data-medical-term]').each(($term) => {
        cy.wrap($term)
          .should('have.attr', 'data-pronunciation')
          .and('have.attr', 'aria-label');
      });

      // Check critical health information highlighting
      cy.get('[data-health-critical="true"]')
        .should('have.css', 'background-color')
        .and('match', /rgba\(.*,.*,.*,(0\.[789]|1)\)/);

      // Run axe analysis
      cy.checkA11y(null, {
        includedImpacts: ['critical', 'serious']
      });
    });

    it('should support keyboard navigation through healthcare sections', () => {
      cy.visit(TEST_ROUTES.enrollment);

      // Test tab order through medical form fields
      cy.get('[data-medical-input]').first().focus()
        .tab()
        .should('have.attr', 'aria-label')
        .and('include', 'health');

      // Verify skip links for long forms
      cy.get('[data-skip-link]')
        .should('be.visible')
        .and('have.attr', 'href')
        .and('match', /#(health|medical)-section/);
    });
  });

  describe('Document Upload Accessibility', () => {
    it('should provide accessible document upload interface', () => {
      cy.visit(TEST_ROUTES.documents);

      // Test document type selection accessibility
      cy.get('[role="radiogroup"][aria-label="Document Type"]')
        .should('exist')
        .find('[role="radio"]')
        .should('have.length.at.least', 3);

      // Verify drag-and-drop alternatives
      cy.get('input[type="file"]')
        .should('exist')
        .and('have.attr', 'aria-label');

      // Test OCR progress indicators
      cy.get('[role="progressbar"]')
        .should('have.attr', 'aria-valuemin', '0')
        .and('have.attr', 'aria-valuemax', '100');

      // Run axe analysis
      cy.checkA11y();
    });
  });

  describe('Video Interview Accessibility', () => {
    it('should provide accessible video consultation interface', () => {
      cy.visit(TEST_ROUTES.interview);

      // Test video controls accessibility
      cy.get('[aria-label="Video Controls"]')
        .should('exist')
        .within(() => {
          cy.get('button[aria-label="Mute"]').should('exist');
          cy.get('button[aria-label="Camera"]').should('exist');
          cy.get('button[aria-label="End Call"]')
            .should('have.attr', 'aria-pressed', 'false');
        });

      // Verify closed captioning
      cy.get('[aria-label="Closed Captions"]')
        .should('exist')
        .and('have.attr', 'aria-pressed');

      // Test emergency controls
      cy.get('[aria-label="Emergency Alert"]')
        .should('have.attr', 'role', 'alert');

      // Run axe analysis
      cy.checkA11y(null, {
        rules: {
          'video-caption': { enabled: true }
        }
      });
    });
  });

  describe('Multi-language Accessibility', () => {
    it('should maintain accessibility across languages', () => {
      // Test Portuguese interface
      cy.visit(TEST_ROUTES.enrollment);
      cy.get('[aria-label="Idioma"]').click();
      cy.get('[role="menuitem"][data-language="pt-BR"]').click();

      // Verify translated ARIA labels
      cy.get('[aria-label="Informações Pessoais"]').should('exist');
      cy.get('[aria-label="Declaração de Saúde"]').should('exist');

      // Test medical terminology in Portuguese
      cy.get('[data-medical-term-pt]').each(($term) => {
        cy.wrap($term)
          .should('have.attr', 'data-pronunciation-pt')
          .and('have.attr', 'aria-label');
      });

      // Run axe analysis with Portuguese rules
      cy.checkA11y(null, {
        locale: 'pt-BR'
      });
    });

    it('should handle right-to-left languages correctly', () => {
      cy.viewport(VIEWPORT_SIZES.desktop.width, VIEWPORT_SIZES.desktop.height);
      
      // Verify RTL support
      cy.get('html')
        .should('have.attr', 'dir')
        .and('match', /ltr|rtl/);

      // Test content reflow in RTL mode
      cy.get('[data-medical-form]')
        .should('have.css', 'direction')
        .and('match', /ltr|rtl/);
    });
  });

  describe('Error States Accessibility', () => {
    it('should provide accessible error messages', () => {
      cy.visit(TEST_ROUTES.healthDeclaration);

      // Submit form with errors
      cy.get('button[type="submit"]').click();

      // Verify error announcements
      cy.get('[role="alert"]')
        .should('exist')
        .and('have.attr', 'aria-live', 'assertive');

      // Test error association with fields
      cy.get('[aria-invalid="true"]').each(($field) => {
        cy.wrap($field)
          .should('have.attr', 'aria-describedby')
          .and('match', /error-message-/);
      });

      // Run axe analysis on error state
      cy.checkA11y();
    });
  });
});