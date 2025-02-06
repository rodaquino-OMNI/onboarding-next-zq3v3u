/**
 * @fileoverview WCAG 2.1 Level AA compliance test suite for AUSTA Integration Platform
 * Implements comprehensive accessibility testing with healthcare-specific requirements
 * @version 1.0.0
 */

import { AxePuppeteer } from '@axe-core/puppeteer'; // ^4.7.0
import { Browser, Page, launch } from 'puppeteer'; // ^19.0.0
import { axeConfiguration } from '../accessibility/axe-config.json';
import { setupTestEnvironment } from '../utils/test-helpers';

// Test configuration constants
const VIEWPORT_SIZES = {
  mobile: { width: 320, height: 568 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1920, height: 1080 }
};

const TEST_TIMEOUT = 10000;

// Critical healthcare components for testing
const HEALTHCARE_COMPONENTS = [
  { selector: '.medical-form', name: 'Medical Form' },
  { selector: '.health-declaration', name: 'Health Declaration' },
  { selector: '[data-critical="true"]', name: 'Critical Health Information' },
  { selector: '.medical-terms', name: 'Medical Terminology' }
];

// Test languages
const TEST_LANGUAGES = ['pt-BR', 'en'];

describe('WCAG 2.1 Level AA Compliance Tests', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    await setupAccessibilityTest();
  });

  afterAll(async () => {
    await cleanupAccessibilityTest();
  });

  /**
   * Initializes test environment with healthcare-specific configurations
   */
  async function setupAccessibilityTest(): Promise<void> {
    // Launch browser with accessibility features enabled
    browser = await launch({
      args: [
        '--enable-features=AccessibilityTest',
        '--force-color-profile=srgb',
        '--reduce-motion'
      ],
      defaultViewport: VIEWPORT_SIZES.desktop
    });

    // Create new page with initial setup
    page = await browser.newPage();
    await page.setBypassCSP(true);

    // Configure axe-core with healthcare rules
    await new AxePuppeteer(page).configure({
      ...axeConfiguration.rules,
      healthcareRules: axeConfiguration.healthcareRules,
      locale: axeConfiguration.locale
    });

    // Set up test environment
    await setupTestEnvironment();
  }

  /**
   * Cleans up test environment and resources
   */
  async function cleanupAccessibilityTest(): Promise<void> {
    if (page) await page.close();
    if (browser) await browser.close();
  }

  /**
   * Tests color contrast compliance for healthcare interfaces
   */
  describe('Color Contrast Tests', () => {
    test('should meet WCAG 2.1 AA contrast requirements for medical information', async () => {
      for (const component of HEALTHCARE_COMPONENTS) {
        const results = await new AxePuppeteer(page)
          .include(component.selector)
          .analyze();

        expect(results.violations.filter(v => v.id === 'color-contrast')).toHaveLength(0);
      }
    }, TEST_TIMEOUT);

    test('should maintain contrast in dark mode for critical health data', async () => {
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });

      const results = await new AxePuppeteer(page)
        .include('[data-critical="true"]')
        .analyze();

      expect(results.violations).toHaveLength(0);
    }, TEST_TIMEOUT);
  });

  /**
   * Tests keyboard navigation for healthcare forms
   */
  describe('Keyboard Navigation Tests', () => {
    test('should support keyboard navigation in medical forms', async () => {
      for (const language of TEST_LANGUAGES) {
        await page.evaluate((lang) => {
          document.documentElement.lang = lang;
        }, language);

        const results = await new AxePuppeteer(page)
          .include('.medical-form')
          .analyze();

        expect(results.violations.filter(v => v.id === 'keyboard-navigable')).toHaveLength(0);
      }
    }, TEST_TIMEOUT);

    test('should maintain focus order in multi-step health declarations', async () => {
      const results = await new AxePuppeteer(page)
        .include('.health-declaration-steps')
        .analyze();

      expect(results.violations.filter(v => 
        v.id === 'focus-order-semantics'
      )).toHaveLength(0);
    }, TEST_TIMEOUT);
  });

  /**
   * Tests screen reader compatibility for medical content
   */
  describe('Screen Reader Compatibility Tests', () => {
    test('should provide proper ARIA labels for medical terms', async () => {
      for (const language of TEST_LANGUAGES) {
        await page.evaluate((lang) => {
          document.documentElement.lang = lang;
        }, language);

        const results = await new AxePuppeteer(page)
          .include('[data-medical-term]')
          .analyze();

        expect(results.violations.filter(v => 
          v.id === 'aria-label'
        )).toHaveLength(0);
      }
    }, TEST_TIMEOUT);

    test('should announce critical health alerts properly', async () => {
      const results = await new AxePuppeteer(page)
        .include('[role="alert"][data-critical="true"]')
        .analyze();

      expect(results.violations.filter(v => 
        v.id === 'aria-alert'
      )).toHaveLength(0);
    }, TEST_TIMEOUT);
  });

  /**
   * Tests responsive design accessibility
   */
  describe('Responsive Design Accessibility Tests', () => {
    for (const [device, viewport] of Object.entries(VIEWPORT_SIZES)) {
      test(`should maintain accessibility on ${device} viewport`, async () => {
        await page.setViewport(viewport);

        const results = await new AxePuppeteer(page)
          .include(HEALTHCARE_COMPONENTS.map(c => c.selector))
          .analyze();

        expect(results.violations).toHaveLength(0);
      }, TEST_TIMEOUT);
    }
  });

  /**
   * Tests multi-language support accessibility
   */
  describe('Multi-language Accessibility Tests', () => {
    for (const language of TEST_LANGUAGES) {
      test(`should provide accessible content in ${language}`, async () => {
        await page.evaluate((lang) => {
          document.documentElement.lang = lang;
        }, language);

        const results = await new AxePuppeteer(page)
          .options(axeConfiguration.runOptions)
          .analyze();

        expect(results.violations).toHaveLength(0);
      }, TEST_TIMEOUT);
    }
  });
});

// Export test utilities for reuse
export {
  setupAccessibilityTest,
  cleanupAccessibilityTest
};