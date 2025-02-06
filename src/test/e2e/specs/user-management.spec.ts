/**
 * End-to-end test suite for user management functionality
 * Implements comprehensive testing for HIPAA compliance, RBAC, and multi-language support
 * @version 1.0.0
 */

import { test, expect } from 'cypress';
import { setupTestEnvironment, createAuthenticatedClient } from '../../utils/test-helpers';
import { 
  User, 
  UserRole, 
  Language 
} from '../../../../web/src/app/core/interfaces/user.interface';

// Test constants
const TEST_TIMEOUT = 10000;
const ADMIN_CREDENTIALS = {
  email: 'admin@test.com',
  password: 'Admin123!',
  role: UserRole.Admin
};

describe('User Management', () => {
  beforeEach(() => {
    // Setup test environment with HIPAA compliance
    cy.wrap(setupTestEnvironment({
      cleanupEnabled: true,
      timeouts: { setup: TEST_TIMEOUT }
    }));

    // Create authenticated admin session
    cy.wrap(createAuthenticatedClient(ADMIN_CREDENTIALS));

    // Visit user management page
    cy.visit('/admin/users', {
      headers: {
        'X-HIPAA-Compliance': 'enabled'
      }
    });

    // Wait for page load
    cy.get('[data-testid="user-management-container"]', { timeout: TEST_TIMEOUT })
      .should('be.visible');
  });

  it('should enforce HIPAA compliance for user data handling', () => {
    // Verify sensitive data masking
    cy.get('[data-testid="user-email"]')
      .should('have.attr', 'data-masked', 'true');

    // Test role-based access restrictions
    cy.get('[data-testid="user-ssn"]')
      .should('not.exist');

    // Verify audit logging
    cy.get('[data-testid="edit-user-btn"]').first().click();
    cy.get('[data-testid="user-name-input"]')
      .clear()
      .type('Updated Name');
    cy.get('[data-testid="save-user-btn"]').click();

    cy.get('[data-testid="audit-log"]')
      .should('contain', 'User updated')
      .and('contain', new Date().toLocaleDateString());

    // Test session timeout
    cy.wait(TEST_TIMEOUT);
    cy.get('[data-testid="session-timeout-warning"]')
      .should('be.visible');

    // Verify secure data transmission
    cy.intercept('PUT', '/api/v1/users/*').as('updateUser');
    cy.wait('@updateUser').then((interception) => {
      expect(interception.request.headers['x-hipaa-compliance']).to.equal('enabled');
      expect(interception.request.headers['content-type']).to.include('application/json');
    });
  });

  it('should support multi-language functionality', () => {
    // Switch to Portuguese
    cy.get('[data-testid="language-selector"]').click();
    cy.get('[data-testid="lang-pt-BR"]').click();

    // Verify UI elements in Portuguese
    cy.get('[data-testid="users-title"]')
      .should('contain', 'Gerenciamento de Usuários');
    cy.get('[data-testid="add-user-btn"]')
      .should('contain', 'Adicionar Usuário');

    // Perform user management operations in Portuguese
    cy.get('[data-testid="add-user-btn"]').click();
    cy.get('[data-testid="user-form"]').within(() => {
      cy.get('[data-testid="name-input"]').type('Novo Usuário');
      cy.get('[data-testid="email-input"]').type('novo@teste.com');
      cy.get('[data-testid="role-select"]').select('Entrevistador');
    });

    // Verify error messages in Portuguese
    cy.get('[data-testid="save-btn"]').click();
    cy.get('[data-testid="error-message"]')
      .should('contain', 'Senha é obrigatória');

    // Switch back to English
    cy.get('[data-testid="language-selector"]').click();
    cy.get('[data-testid="lang-en"]').click();

    // Verify UI reverts to English
    cy.get('[data-testid="users-title"]')
      .should('contain', 'User Management');
  });

  it('should implement role-based access control', () => {
    // Test admin access
    cy.get('[data-testid="user-actions"]')
      .should('contain', 'Edit')
      .and('contain', 'Delete');

    // Switch to interviewer role
    cy.wrap(createAuthenticatedClient({
      email: 'interviewer@test.com',
      password: 'Test123!',
      role: UserRole.Interviewer
    }));

    cy.reload();

    // Verify limited permissions
    cy.get('[data-testid="user-actions"]')
      .should('contain', 'View')
      .and('not.contain', 'Delete');

    // Test broker role restrictions
    cy.wrap(createAuthenticatedClient({
      email: 'broker@test.com',
      password: 'Test123!',
      role: UserRole.Broker
    }));

    cy.reload();

    // Verify read-only access
    cy.get('[data-testid="add-user-btn"]')
      .should('not.exist');
    cy.get('[data-testid="user-list"]')
      .should('be.visible');
  });

  it('should handle user preferences and settings', () => {
    // Test preference updates
    cy.get('[data-testid="user-preferences"]').click();
    cy.get('[data-testid="theme-selector"]')
      .select('dark');
    cy.get('[data-testid="notification-email"]')
      .check();
    cy.get('[data-testid="save-preferences"]').click();

    // Verify persistence
    cy.reload();
    cy.get('[data-testid="theme-selector"]')
      .should('have.value', 'dark');
    cy.get('[data-testid="notification-email"]')
      .should('be.checked');

    // Test accessibility settings
    cy.get('[data-testid="accessibility-settings"]').click();
    cy.get('[data-testid="font-size"]')
      .clear()
      .type('18');
    cy.get('[data-testid="high-contrast"]')
      .check();
    cy.get('[data-testid="save-accessibility"]').click();

    // Verify applied settings
    cy.get('body')
      .should('have.css', 'font-size', '18px');
  });

  it('should manage user search and filtering', () => {
    // Test search functionality
    cy.get('[data-testid="user-search"]')
      .type('admin');
    cy.get('[data-testid="user-list"]')
      .should('contain', 'admin@test.com');

    // Test role filtering
    cy.get('[data-testid="role-filter"]')
      .select(UserRole.Interviewer);
    cy.get('[data-testid="user-list"]')
      .should('not.contain', 'admin@test.com');

    // Test combined search and filter
    cy.get('[data-testid="user-search"]')
      .clear()
      .type('interviewer');
    cy.get('[data-testid="user-list"]')
      .should('contain', 'interviewer@test.com');

    // Test empty results
    cy.get('[data-testid="user-search"]')
      .clear()
      .type('nonexistent');
    cy.get('[data-testid="no-results"]')
      .should('be.visible');
  });
});