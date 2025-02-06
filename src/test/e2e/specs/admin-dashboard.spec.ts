/**
 * @fileoverview End-to-end test suite for admin dashboard functionality
 * Implements comprehensive testing of metrics display, user management,
 * real-time monitoring, and HIPAA compliance verification
 * @version 1.0.0
 */

import { test, expect } from 'cypress';
import { setupTestEnvironment, createAuthenticatedClient } from '../../utils/test-helpers';
import { DashboardComponent } from '../../../../src/web/src/app/features/admin/pages/dashboard/dashboard.component';
import { UserRole } from '../../../../src/web/src/app/core/interfaces/user.interface';
import { EnrollmentStatus } from '../../../../src/web/src/app/core/interfaces/enrollment.interface';

// Test constants
const TEST_TIMEOUT = 10000;
const ADMIN_ROLE = 'admin';
const PERFORMANCE_THRESHOLD = 1000;
const RETRY_ATTEMPTS = 3;

describe('Admin Dashboard', () => {
  beforeEach(() => {
    // Initialize HIPAA-compliant test environment
    cy.wrap(setupTestEnvironment({
      cleanupEnabled: true,
      timeouts: { setup: TEST_TIMEOUT }
    }));

    // Create authenticated admin user
    cy.wrap(createAuthenticatedClient(UserRole.Admin));

    // Visit dashboard with security headers
    cy.visit('/admin/dashboard', {
      headers: {
        'X-HIPAA-Compliance': 'enabled',
        'X-Security-Context': 'test'
      }
    });

    // Wait for initial data load
    cy.get('[data-testid="dashboard-metrics"]', { timeout: TEST_TIMEOUT })
      .should('exist');
  });

  it('should display enrollment metrics with HIPAA compliance', () => {
    // Verify metrics display
    cy.get('[data-testid="enrollment-metrics"]').within(() => {
      // Check total enrollments with data masking
      cy.get('[data-testid="total-enrollments"]')
        .should('exist')
        .invoke('text')
        .should('match', /^\d+0$/); // Verify masking to nearest 10

      // Verify active enrollments
      cy.get('[data-testid="active-enrollments"]')
        .should('exist')
        .and('not.be.empty');

      // Check completion rate
      cy.get('[data-testid="completion-rate"]')
        .should('exist')
        .invoke('text')
        .should('match', /^\d{1,3}%$/);
    });

    // Verify HIPAA compliance of displayed data
    cy.get('[data-testid="phi-data"]').should('not.exist');
  });

  it('should handle real-time updates with performance validation', () => {
    // Start performance monitoring
    cy.window().then((win) => {
      const startTime = performance.now();

      // Trigger metrics refresh
      cy.get('[data-testid="refresh-metrics"]').click();

      // Verify update performance
      cy.get('[data-testid="metrics-updated"]')
        .should('exist')
        .then(() => {
          const endTime = performance.now();
          const duration = endTime - startTime;
          expect(duration).to.be.lessThan(PERFORMANCE_THRESHOLD);
        });
    });

    // Verify real-time updates
    cy.get('[data-testid="last-updated"]')
      .should('contain', new Date().toLocaleDateString());
  });

  it('should support multi-language display', () => {
    // Test Portuguese language
    cy.get('[data-testid="language-selector"]').click();
    cy.get('[data-testid="lang-pt-BR"]').click();

    // Verify Portuguese translations
    cy.get('[data-testid="dashboard-title"]')
      .should('contain', 'Painel de Controle');
    cy.get('[data-testid="metrics-label"]')
      .should('contain', 'Métricas');

    // Test English language
    cy.get('[data-testid="language-selector"]').click();
    cy.get('[data-testid="lang-en"]').click();

    // Verify English translations
    cy.get('[data-testid="dashboard-title"]')
      .should('contain', 'Dashboard');
    cy.get('[data-testid="metrics-label"]')
      .should('contain', 'Metrics');
  });

  it('should handle error states appropriately', () => {
    // Simulate API error
    cy.intercept('GET', '**/metrics', {
      statusCode: 500,
      body: { error: 'Internal Server Error' }
    }).as('metricsError');

    // Trigger refresh
    cy.get('[data-testid="refresh-metrics"]').click();

    // Verify error display
    cy.get('[data-testid="error-message"]')
      .should('be.visible')
      .and('contain', 'Error loading metrics');

    // Verify retry mechanism
    cy.get('[data-testid="retry-button"]')
      .should('be.visible')
      .click();

    // Verify retry attempts
    cy.get('@metricsError.all').should('have.length', RETRY_ATTEMPTS);
  });

  it('should validate enrollment status transitions', () => {
    // Check status distribution chart
    cy.get('[data-testid="status-chart"]').within(() => {
      // Verify all status types are displayed
      Object.values(EnrollmentStatus).forEach(status => {
        cy.get(`[data-status="${status}"]`)
          .should('exist')
          .and('have.attr', 'aria-label');
      });
    });

    // Verify status percentages
    cy.get('[data-testid="status-percentages"]').within(() => {
      cy.get('[data-testid="completed-percentage"]')
        .invoke('text')
        .should('match', /^\d{1,3}%$/);
    });
  });

  afterEach(() => {
    // Clean up test data
    cy.wrap(setupTestEnvironment({ cleanupEnabled: true }));

    // Verify audit logs for dashboard access
    cy.task('verifyAuditLogs', {
      component: 'AdminDashboard',
      action: 'VIEW'
    }).then((auditLogs) => {
      expect(auditLogs).to.have.length.greaterThan(0);
    });
  });
});