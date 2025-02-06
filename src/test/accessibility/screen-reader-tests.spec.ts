/**
 * @fileoverview Screen reader accessibility test suite for healthcare enrollment platform
 * Implements WCAG 2.1 Level AA compliance testing with healthcare-specific focus
 * @version 1.0.0
 */

import { jest } from '@jest/globals';
import axe from 'axe-core';
import { axeConfiguration } from '../axe-config.json';
import { setupTestEnvironment } from '../utils/test-helpers';
import { AlertComponent } from '../../src/web/src/app/shared/components/alert/alert.component';
import { Language } from '../../src/web/src/app/core/interfaces/user.interface';

// Test configuration constants
const TEST_TIMEOUT = 15000;
const HEALTHCARE_COMPONENTS = ['/enrollment', '/medical-history', '/health-declaration', '/document-upload'];
const SUPPORTED_LANGUAGES = ['en-US', 'pt-BR'];

describe('Healthcare Screen Reader Accessibility Tests', () => {
  let testEnv: any;
  let axeRunner: any;

  beforeEach(async () => {
    testEnv = await setupTestEnvironment();
    axeRunner = await axe.configure(axeConfiguration);
  });

  describe('Healthcare Form Accessibility', () => {
    test('should announce required medical form fields correctly', async () => {
      const results = await axeRunner.run('#medical-form', {
        rules: ['label', 'aria-required-attr']
      });

      expect(results.violations).toHaveLength(0);
      expect(results.passes).toContain(expect.objectContaining({
        id: 'aria-required-attr',
        nodes: expect.arrayContaining([
          expect.objectContaining({
            target: ['#ssn-input'],
            html: expect.stringContaining('aria-required="true"')
          })
        ])
      }));
    });

    test('should provide clear error messages for medical form validation', async () => {
      const form = document.querySelector('#health-declaration-form');
      const submitButton = form?.querySelector('button[type="submit"]');
      
      submitButton?.click();
      await new Promise(resolve => setTimeout(resolve, 100));

      const results = await axeRunner.run('#health-declaration-form', {
        rules: ['aria-alert', 'aria-live']
      });

      expect(results.violations).toHaveLength(0);
      expect(document.querySelectorAll('[role="alert"]')).toBeTruthy();
    });
  });

  describe('Medical Terminology Pronunciation', () => {
    test('should provide pronunciation guidance for medical terms', async () => {
      const results = await axeRunner.run('#medical-terms', {
        rules: ['medical-term-pronunciation']
      });

      expect(results.violations).toHaveLength(0);
      expect(results.passes).toContain(expect.objectContaining({
        id: 'medical-term-pronunciation',
        nodes: expect.arrayContaining([
          expect.objectContaining({
            target: ['[data-medical-term]'],
            html: expect.stringContaining('data-pronunciation')
          })
        ])
      }));
    });
  });

  describe('Multi-language Support', () => {
    test.each(SUPPORTED_LANGUAGES)('should announce content correctly in %s', async (language) => {
      await testEnv.setLanguage(language);
      
      const results = await axeRunner.run('#enrollment-form', {
        rules: ['valid-lang', 'html-lang-valid']
      });

      expect(results.violations).toHaveLength(0);
      expect(document.documentElement.lang).toBe(language);
    });

    test('should handle language switching without losing focus', async () => {
      const languageSelector = document.querySelector('#language-selector');
      const focusedElement = document.activeElement;
      
      languageSelector?.querySelector('option[value="en-US"]')?.click();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(document.activeElement).toBe(focusedElement);
    });
  });

  describe('Critical Health Information', () => {
    test('should announce critical health alerts with proper urgency', async () => {
      const alertComponent = new AlertComponent();
      const criticalAlert = {
        type: 'error',
        message: 'Critical health information requires immediate attention',
        translationKey: 'alerts.critical_health'
      };

      alertComponent.announceAlert(criticalAlert);

      const results = await axeRunner.run('[role="alert"]', {
        rules: ['aria-live']
      });

      expect(results.violations).toHaveLength(0);
      expect(document.querySelector('[aria-live="assertive"]')).toBeTruthy();
    });

    test('should maintain focus when displaying health warnings', async () => {
      const warningButton = document.querySelector('#show-health-warning');
      const originalFocus = document.activeElement;

      warningButton?.click();
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(document.activeElement).toBe(originalFocus);
      expect(document.querySelector('[role="alert"]')).toBeTruthy();
    });
  });

  describe('Document Upload Accessibility', () => {
    test('should provide clear upload status announcements', async () => {
      const results = await axeRunner.run('#document-upload', {
        rules: ['aria-progressbar']
      });

      expect(results.violations).toHaveLength(0);
      expect(document.querySelector('[role="progressbar"]')).toBeTruthy();
    });

    test('should announce document validation errors accessibly', async () => {
      const uploadInput = document.querySelector('#document-upload input[type="file"]');
      const invalidFile = new File([''], 'test.txt', { type: 'text/plain' });

      uploadInput?.dispatchEvent(new Event('change'));
      await new Promise(resolve => setTimeout(resolve, 100));

      const results = await axeRunner.run('#document-upload-error', {
        rules: ['aria-alert']
      });

      expect(results.violations).toHaveLength(0);
      expect(document.querySelector('[role="alert"]')).toBeTruthy();
    });
  });

  describe('Navigation and Landmarks', () => {
    test('should properly identify healthcare-specific regions', async () => {
      const results = await axeRunner.run('main', {
        rules: ['landmark-unique', 'region']
      });

      expect(results.violations).toHaveLength(0);
      expect(document.querySelectorAll('[role="region"][aria-label*="health"]')).toBeTruthy();
    });

    test('should maintain logical tab order through medical forms', async () => {
      const results = await axeRunner.run('#medical-history-form', {
        rules: ['focus-order-semantics']
      });

      expect(results.violations).toHaveLength(0);
    });
  });

  describe('Interactive Elements', () => {
    test('should handle custom medical form controls accessibly', async () => {
      const results = await axeRunner.run('.custom-medical-input', {
        rules: ['aria-allowed-attr', 'aria-required-attr']
      });

      expect(results.violations).toHaveLength(0);
    });

    test('should provide accessible autocomplete for medical terms', async () => {
      const results = await axeRunner.run('#condition-search', {
        rules: ['aria-autocomplete', 'aria-expanded']
      });

      expect(results.violations).toHaveLength(0);
      expect(document.querySelector('[role="combobox"]')).toBeTruthy();
    });
  });
});