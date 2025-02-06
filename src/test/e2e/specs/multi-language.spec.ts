/**
 * @fileoverview End-to-end tests for multi-language support functionality
 * Validates language switching, content translation, and accessibility
 * @version 1.0.0
 */

import { test, expect, describe, beforeEach } from '@jest/globals';
import { Page, Browser, chromium, accessibility } from 'playwright';
import { setupTestEnvironment, waitForAsyncOperation } from '../../utils/test-helpers';
import { APIClient } from '../../utils/api-client';
import { Language } from '../../../web/src/app/core/interfaces/user.interface';

// Test configuration constants
const TEST_TIMEOUT = 15000;
const BASE_URL = 'http://localhost:4200';
const SUPPORTED_LANGUAGES = ['pt-BR', 'en-US'] as const;

/**
 * Interface for language-specific test content
 */
interface LanguageContent {
  languageName: string;
  privacyNotice: string;
  consentText: string;
  errorMessages: Record<string, string>;
  labels: Record<string, string>;
}

/**
 * Test content mapping for supported languages
 */
const LANGUAGE_CONTENT: Record<Language, LanguageContent> = {
  [Language.English]: {
    languageName: 'English',
    privacyNotice: 'Privacy Notice',
    consentText: 'I agree to the processing of my personal data',
    errorMessages: {
      required: 'This field is required',
      invalid: 'Please enter a valid value'
    },
    labels: {
      languageSelector: 'Select Language',
      submit: 'Submit',
      cancel: 'Cancel'
    }
  },
  [Language.Portuguese]: {
    languageName: 'Português',
    privacyNotice: 'Aviso de Privacidade',
    consentText: 'Concordo com o processamento dos meus dados pessoais',
    errorMessages: {
      required: 'Este campo é obrigatório',
      invalid: 'Por favor, insira um valor válido'
    },
    labels: {
      languageSelector: 'Selecionar Idioma',
      submit: 'Enviar',
      cancel: 'Cancelar'
    }
  }
};

/**
 * Multi-language support test suite
 */
describe('Multi-language Support', () => {
  let browser: Browser;
  let page: Page;
  let apiClient: APIClient;

  /**
   * Setup test environment before each test
   */
  beforeEach(async () => {
    // Initialize test environment
    const testEnv = await setupTestEnvironment();
    apiClient = testEnv.apiClient;

    // Launch browser with accessibility testing support
    browser = await chromium.launch({
      args: ['--enable-accessibility'],
    });

    // Create new page with viewport settings
    page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      locale: 'en-US'
    });

    // Navigate to application
    await page.goto(BASE_URL);
  }, TEST_TIMEOUT);

  /**
   * Cleanup after each test
   */
  afterEach(async () => {
    await browser.close();
  });

  /**
   * Validates language selector accessibility
   */
  test('language selector meets accessibility standards', async () => {
    // Check language selector presence and accessibility
    const languageSelector = await page.locator('[data-testid="language-selector"]');
    await expect(languageSelector).toBeVisible();

    // Verify ARIA attributes
    const ariaLabel = await languageSelector.getAttribute('aria-label');
    expect(ariaLabel).toBe('Select Language');

    // Test keyboard navigation
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(focused).toBe('language-selector');

    // Verify screen reader compatibility
    const a11yNode = await accessibility.getAccessibilityTree(page);
    expect(a11yNode).toContainRole('combobox');
  });

  /**
   * Tests language switching functionality
   */
  test('switches language correctly', async () => {
    for (const language of SUPPORTED_LANGUAGES) {
      // Select language
      await page.selectOption('[data-testid="language-selector"]', language);
      await waitForAsyncOperation();

      // Verify HTML lang attribute
      const htmlLang = await page.$eval('html', el => el.lang);
      expect(htmlLang).toBe(language);

      // Verify content translation
      const content = LANGUAGE_CONTENT[language === 'pt-BR' ? Language.Portuguese : Language.English];
      await expect(page.locator('[data-testid="privacy-notice"]')).toHaveText(content.privacyNotice);
      await expect(page.locator('[data-testid="consent-text"]')).toHaveText(content.consentText);
    }
  });

  /**
   * Validates LGPD compliance in Brazilian Portuguese
   */
  test('displays correct LGPD notices in Portuguese', async () => {
    // Switch to Portuguese
    await page.selectOption('[data-testid="language-selector"]', 'pt-BR');
    await waitForAsyncOperation();

    // Verify LGPD-specific content
    const lgpdNotice = await page.locator('[data-testid="lgpd-notice"]');
    await expect(lgpdNotice).toBeVisible();
    await expect(lgpdNotice).toContainText('Lei Geral de Proteção de Dados');

    // Validate consent mechanisms
    const consentCheckbox = await page.locator('[data-testid="lgpd-consent"]');
    await expect(consentCheckbox).toBeVisible();
    await expect(consentCheckbox).toHaveAttribute('aria-required', 'true');

    // Verify data handling disclosures
    const dataHandling = await page.locator('[data-testid="data-handling-notice"]');
    await expect(dataHandling).toContainText('processamento dos seus dados pessoais');
  });

  /**
   * Tests form validation messages in different languages
   */
  test('displays validation messages in selected language', async () => {
    for (const language of SUPPORTED_LANGUAGES) {
      // Select language
      await page.selectOption('[data-testid="language-selector"]', language);
      await waitForAsyncOperation();

      // Trigger validation errors
      await page.click('[data-testid="submit-button"]');

      // Verify error messages
      const content = LANGUAGE_CONTENT[language === 'pt-BR' ? Language.Portuguese : Language.English];
      const errorMessage = await page.locator('[data-testid="validation-error"]').first();
      await expect(errorMessage).toHaveText(content.errorMessages.required);
    }
  });

  /**
   * Validates language persistence across sessions
   */
  test('persists language preference', async () => {
    // Set language preference
    await page.selectOption('[data-testid="language-selector"]', 'pt-BR');
    await waitForAsyncOperation();

    // Reload page
    await page.reload();
    await waitForAsyncOperation();

    // Verify language persistence
    const htmlLang = await page.$eval('html', el => el.lang);
    expect(htmlLang).toBe('pt-BR');

    // Verify selected option
    const selectedLanguage = await page.$eval(
      '[data-testid="language-selector"]',
      el => (el as HTMLSelectElement).value
    );
    expect(selectedLanguage).toBe('pt-BR');
  });

  /**
   * Tests screen reader compatibility
   */
  test('provides proper screen reader support', async () => {
    // Enable screen reader testing mode
    await page.evaluate(() => {
      window.addEventListener('announce', console.log);
    });

    // Test language switching announcement
    await page.selectOption('[data-testid="language-selector"]', 'pt-BR');
    await waitForAsyncOperation();

    // Verify ARIA live regions
    const liveRegion = await page.locator('[aria-live="polite"]');
    await expect(liveRegion).toHaveText(/Idioma alterado para Português/);

    // Test focus management
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    expect(focusedElement).toBe('Selecionar Idioma');
  });
});