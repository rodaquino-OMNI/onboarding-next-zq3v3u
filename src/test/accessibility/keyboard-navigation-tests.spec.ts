/**
 * @fileoverview Keyboard navigation accessibility tests for healthcare enrollment platform
 * Implements WCAG 2.1 Level AA compliance testing with HIPAA considerations
 * @version 1.0.0
 */

import { test, expect, describe, beforeEach, afterEach } from 'jest';
import { configure } from '@testing-library/cypress';
import { AxeBuilder } from '@axe-core/playwright';
import { setupTestEnvironment } from '../utils/test-helpers';
import { axeConfiguration } from './axe-config';
import { Language } from '../../web/src/app/core/interfaces/user.interface';
import { DocumentType } from '../../web/src/app/core/interfaces/document.interface';

// Test configuration constants
const TEST_TIMEOUT = 10000;
const KEYBOARD_EVENTS = {
  ENTER: '13',
  SPACE: '32',
  TAB: '9',
  ESCAPE: '27',
  ARROW_UP: '38',
  ARROW_DOWN: '40'
};

const LANGUAGES = {
  EN: Language.English,
  PT: Language.Portuguese
};

/**
 * Configure testing library with healthcare-specific settings
 */
configure({
  testIdAttribute: 'data-testid',
  asyncUtilTimeout: TEST_TIMEOUT,
  computedStyleSupportsPseudoElements: true
});

describe('Healthcare Keyboard Navigation Accessibility', () => {
  let axe: AxeBuilder;
  let testEnv: any;

  beforeEach(async () => {
    testEnv = await setupTestEnvironment();
    axe = new AxeBuilder()
      .configure(axeConfiguration.rules)
      .options(axeConfiguration.runOptions);
  });

  afterEach(async () => {
    await testEnv.cleanup();
  });

  /**
   * Tests keyboard navigation for healthcare document upload component
   * @param language - Interface language for testing
   */
  async function testFileUploadKeyboardNavigation(language: Language): Promise<void> {
    test(`Document upload keyboard navigation - ${language}`, async () => {
      // Navigate to document upload page
      await testEnv.navigateTo('/documents/upload');

      // Verify file input is keyboard accessible
      const fileInput = await testEnv.getByTestId('document-upload-input');
      expect(await fileInput.isFocusable()).toBe(true);
      expect(await fileInput.getAttribute('aria-label')).toBeTruthy();

      // Test keyboard activation of file selection
      await fileInput.focus();
      await testEnv.keyboard.press(KEYBOARD_EVENTS.SPACE);
      expect(await fileInput.getAttribute('aria-expanded')).toBe('true');

      // Verify document type selection via keyboard
      const typeSelect = await testEnv.getByTestId('document-type-select');
      await typeSelect.focus();
      await testEnv.keyboard.press(KEYBOARD_EVENTS.ARROW_DOWN);
      await testEnv.keyboard.press(KEYBOARD_EVENTS.ENTER);
      expect(await typeSelect.getAttribute('value')).toBe(DocumentType.HEALTH_DECLARATION);

      // Test upload button keyboard activation
      const uploadButton = await testEnv.getByTestId('upload-submit-button');
      await uploadButton.focus();
      await testEnv.keyboard.press(KEYBOARD_EVENTS.ENTER);
      expect(await testEnv.getByTestId('upload-progress')).toBeVisible();

      // Verify HIPAA compliance indicators
      expect(await testEnv.getByTestId('hipaa-indicator')).toHaveAttribute('aria-label');
    }, TEST_TIMEOUT);
  }

  /**
   * Tests keyboard navigation through healthcare enrollment form
   * @param language - Interface language for testing
   */
  async function testEnrollmentFormKeyboardNavigation(language: Language): Promise<void> {
    test(`Enrollment form keyboard navigation - ${language}`, async () => {
      await testEnv.navigateTo('/enrollment/new');

      // Test form field tab order
      const formFields = await testEnv.getAllByRole('textbox, combobox, checkbox');
      for (const field of formFields) {
        await field.focus();
        expect(await field.isFocused()).toBe(true);
        await testEnv.keyboard.press(KEYBOARD_EVENTS.TAB);
      }

      // Test medical terms pronunciation
      const medicalTerms = await testEnv.getAllByTestId('medical-term');
      for (const term of medicalTerms) {
        await term.focus();
        expect(await term.getAttribute('data-pronunciation')).toBeTruthy();
      }

      // Test critical health data modal
      const healthDataButton = await testEnv.getByTestId('health-data-button');
      await healthDataButton.focus();
      await testEnv.keyboard.press(KEYBOARD_EVENTS.ENTER);
      
      const modal = await testEnv.getByRole('dialog');
      expect(await modal.getAttribute('aria-modal')).toBe('true');
      expect(await testEnv.getByTestId('modal-close')).toBeFocused();
    }, TEST_TIMEOUT);
  }

  /**
   * Tests keyboard controls for HIPAA-compliant video interview interface
   * @param language - Interface language for testing
   */
  async function testVideoInterviewKeyboardControls(language: Language): Promise<void> {
    test(`Video interview keyboard controls - ${language}`, async () => {
      await testEnv.navigateTo('/interview/session');

      // Test video control keyboard shortcuts
      const controls = await testEnv.getByTestId('video-controls');
      await controls.focus();

      // Test mute toggle
      await testEnv.keyboard.press('m');
      expect(await testEnv.getByTestId('mute-indicator')).toHaveAttribute('aria-label', 'Muted');

      // Test camera toggle
      await testEnv.keyboard.press('v');
      expect(await testEnv.getByTestId('camera-indicator')).toHaveAttribute('aria-label', 'Camera Off');

      // Test end call dialog
      await testEnv.keyboard.press(KEYBOARD_EVENTS.ESCAPE);
      const endCallDialog = await testEnv.getByTestId('end-call-dialog');
      expect(await endCallDialog.getAttribute('role')).toBe('alertdialog');
      expect(await endCallDialog.isFocused()).toBe(true);
    }, TEST_TIMEOUT);
  }

  /**
   * Tests keyboard accessibility of language switcher
   */
  async function testLanguageSwitcherKeyboardAccess(): Promise<void> {
    test('Language switcher keyboard accessibility', async () => {
      const languageSwitcher = await testEnv.getByTestId('language-switcher');
      await languageSwitcher.focus();

      // Open language menu
      await testEnv.keyboard.press(KEYBOARD_EVENTS.ENTER);
      expect(await testEnv.getByRole('menu')).toBeVisible();

      // Navigate through options
      await testEnv.keyboard.press(KEYBOARD_EVENTS.ARROW_DOWN);
      expect(await testEnv.getByTestId('lang-option-pt')).toBeFocused();

      // Select language
      await testEnv.keyboard.press(KEYBOARD_EVENTS.ENTER);
      expect(await languageSwitcher.getAttribute('value')).toBe(LANGUAGES.PT);

      // Verify medical terms update
      const medicalTerms = await testEnv.getAllByTestId('medical-term');
      for (const term of medicalTerms) {
        expect(await term.getAttribute('lang')).toBe('pt-BR');
      }
    }, TEST_TIMEOUT);
  }

  // Execute test suites for each supported language
  for (const language of Object.values(LANGUAGES)) {
    describe(`Language: ${language}`, () => {
      test('Accessibility validation', async () => {
        const results = await axe.analyze();
        expect(results.violations).toHaveLength(0);
      });

      testFileUploadKeyboardNavigation(language);
      testEnrollmentFormKeyboardNavigation(language);
      testVideoInterviewKeyboardControls(language);
    });
  }

  // Language-independent tests
  testLanguageSwitcherKeyboardAccess();
});