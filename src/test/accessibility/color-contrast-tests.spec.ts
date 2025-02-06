/**
 * @fileoverview Color contrast accessibility test suite for AUSTA Integration Platform
 * Implements WCAG 2.1 Level AA compliance with enhanced healthcare requirements
 * @version 1.0.0
 */

import { setupTestEnvironment } from '../utils/test-helpers';
import { axeConfiguration } from './axe-config.json';
import axe from 'axe-core'; // ^4.7.0
import puppeteer from 'puppeteer'; // ^19.0.0

// Global test configuration
const TEST_TIMEOUT = 15000;
const CONTRAST_RATIO_NORMAL = 4.5;
const CONTRAST_RATIO_LARGE = 3.0;
const CONTRAST_RATIO_MEDICAL = 7.0;
const SUPPORTED_LANGUAGES = ['en-US', 'pt-BR', 'es-ES'];

/**
 * Enhanced color contrast test suite with healthcare-specific validations
 */
describe('Color Contrast Accessibility Tests', () => {
  let browser: puppeteer.Browser;
  let page: puppeteer.Page;

  // Healthcare-specific selectors requiring enhanced contrast
  const healthcareSelectors = {
    criticalInfo: '[data-critical="true"]',
    medicalData: '.medical-info',
    healthDeclaration: '.health-declaration',
    medicationList: '.medication-list',
    diagnosisInfo: '.diagnosis-info',
    alertMessages: '.medical-alert',
    consentForms: '.consent-form'
  };

  beforeAll(async () => {
    // Initialize test environment with healthcare settings
    await setupTestEnvironment();

    // Launch browser with specific viewport for consistent testing
    browser = await puppeteer.launch({
      headless: true,
      defaultViewport: { width: 1280, height: 900 }
    });

    // Create new page and configure axe
    page = await browser.newPage();
    await page.setBypassCSP(true);
    await page.addScriptTag({
      path: require.resolve('axe-core')
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  /**
   * Tests color contrast for standard UI elements
   */
  describe('Standard UI Elements', () => {
    test('Primary text elements meet WCAG AA contrast requirements', async () => {
      await testColorContrast('.primary-text', CONTRAST_RATIO_NORMAL, false);
    });

    test('Secondary text elements meet WCAG AA contrast requirements', async () => {
      await testColorContrast('.secondary-text', CONTRAST_RATIO_NORMAL, false);
    });

    test('Large text elements meet WCAG AA contrast requirements', async () => {
      await testColorContrast('.large-text', CONTRAST_RATIO_LARGE, false);
    });
  });

  /**
   * Tests color contrast for healthcare-specific elements
   */
  describe('Healthcare Elements', () => {
    test('Critical medical information meets enhanced contrast requirements', async () => {
      await testColorContrast(healthcareSelectors.criticalInfo, CONTRAST_RATIO_MEDICAL, true);
    });

    test('Health declaration forms meet enhanced contrast requirements', async () => {
      await testColorContrast(healthcareSelectors.healthDeclaration, CONTRAST_RATIO_MEDICAL, true);
    });

    test('Medication information meets enhanced contrast requirements', async () => {
      await testColorContrast(healthcareSelectors.medicationList, CONTRAST_RATIO_MEDICAL, true);
    });
  });

  /**
   * Tests color contrast across different themes
   */
  describe('Theme-based Contrast', () => {
    test('Light theme meets contrast requirements', async () => {
      await testThemeColorContrast('light', false);
    });

    test('Dark theme meets contrast requirements', async () => {
      await testThemeColorContrast('dark', false);
    });

    test('System preference theme meets contrast requirements', async () => {
      await testThemeColorContrast('system', true);
    });
  });

  /**
   * Tests color contrast across different languages
   */
  describe('Multi-language Support', () => {
    SUPPORTED_LANGUAGES.forEach(language => {
      test(`Color contrast requirements are met for ${language}`, async () => {
        await page.evaluate((lang) => {
          document.documentElement.lang = lang;
        }, language);

        // Test critical healthcare elements in each language
        for (const [key, selector] of Object.entries(healthcareSelectors)) {
          await testColorContrast(selector, CONTRAST_RATIO_MEDICAL, true);
        }
      });
    });
  });

  /**
   * Tests color contrast for interactive elements
   */
  describe('Interactive Elements', () => {
    test('Form inputs meet contrast requirements', async () => {
      await testColorContrast('input, select, textarea', CONTRAST_RATIO_NORMAL, false);
    });

    test('Buttons meet contrast requirements', async () => {
      await testColorContrast('button, .btn', CONTRAST_RATIO_NORMAL, false);
    });

    test('Links meet contrast requirements', async () => {
      await testColorContrast('a', CONTRAST_RATIO_NORMAL, false);
    });
  });
});

/**
 * Tests color contrast ratio for specified selector
 */
async function testColorContrast(
  selector: string,
  expectedRatio: number,
  isMedicalData: boolean
): Promise<void> {
  const results = await page.evaluate((sel, config) => {
    return axe.run(document, {
      rules: [
        {
          id: 'color-contrast',
          selector: sel,
          ...config
        }
      ]
    });
  }, selector, axeConfiguration.rules['color-contrast']);

  // Enhanced validation for medical data
  if (isMedicalData) {
    expect(results.violations).toEqual([]);
    expect(results.passes[0]?.result).toBeGreaterThanOrEqual(expectedRatio);
  } else {
    expect(results.violations).toEqual([]);
    expect(results.passes[0]?.result).toBeGreaterThanOrEqual(expectedRatio);
  }
}

/**
 * Tests color contrast compliance across different themes
 */
async function testThemeColorContrast(
  theme: string,
  systemPreference: boolean
): Promise<void> {
  // Set theme
  await page.evaluate((themeValue, useSystem) => {
    if (useSystem) {
      // Use system preference
      const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', themeValue);
    }
  }, theme, systemPreference);

  // Test all critical elements in current theme
  for (const [key, selector] of Object.entries(healthcareSelectors)) {
    await testColorContrast(selector, CONTRAST_RATIO_MEDICAL, true);
  }

  // Test standard UI elements
  await testColorContrast('.primary-text', CONTRAST_RATIO_NORMAL, false);
  await testColorContrast('.secondary-text', CONTRAST_RATIO_NORMAL, false);
}