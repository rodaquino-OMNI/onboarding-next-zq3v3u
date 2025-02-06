import { defineConfig } from 'cypress';
import { compilerOptions } from './e2e/tsconfig.e2e.json';
import { rules as axeRules } from './accessibility/axe-config.json';

// Version comments for external dependencies
// cypress: ^12.0.0
// cypress-axe: ^1.0.0
// @faker-js/faker: ^8.0.0

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4200',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    viewportWidth: 1920,
    viewportHeight: 1080,
    video: true,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 30000,
    requestTimeout: 30000,
    responseTimeout: 60000,

    setupNodeEvents(on, config) {
      // Register accessibility testing plugins
      require('cypress-axe')(on, config, {
        rules: axeRules,
        locale: {
          languages: ['en', 'pt-BR'],
          defaultLang: 'pt-BR'
        }
      });

      // Configure code coverage reporting
      require('@cypress/code-coverage/task')(on, config);
      on('task', {
        validateCoverage: ({ coverage }) => {
          if (coverage < config.env.COVERAGE_THRESHOLD) {
            throw new Error(`Coverage ${coverage}% does not meet threshold of ${config.env.COVERAGE_THRESHOLD}%`);
          }
          return null;
        }
      });

      // Configure healthcare-specific test data generation
      const faker = require('@faker-js/faker');
      on('task', {
        generateHealthcareData: ({ locale = 'pt-BR' }) => {
          faker.setLocale(locale);
          return {
            patientName: faker.person.fullName(),
            medicalRecord: faker.string.alphanumeric(10).toUpperCase(),
            healthInsurance: faker.finance.accountNumber(12),
            diagnosis: faker.helpers.arrayElement(['Diabetes', 'Hypertension', 'Asthma'])
          };
        }
      });

      // Configure secure screenshot and video storage
      on('after:screenshot', (details) => {
        // Encrypt sensitive health data in screenshots
        return require('./utils/secure-screenshot').process(details);
      });

      // Setup EMR integration testing
      on('task', {
        setupEMRTestEnvironment: () => {
          return require('./utils/emr-mock').initialize({
            fhirEndpoint: config.env.EMR_ENDPOINTS.fhir,
            hl7Endpoint: config.env.EMR_ENDPOINTS.hl7
          });
        }
      });

      return config;
    },

    env: {
      API_URL: 'http://localhost:8000/api/v1',
      COVERAGE: true,
      COVERAGE_THRESHOLD: 80,
      LANGUAGES: ['en', 'pt-BR'],
      DEFAULT_LANGUAGE: 'en',
      ACCESSIBILITY_COMPLIANCE: 'WCAG2.1-AA',
      EMR_ENDPOINTS: {
        fhir: 'http://localhost:8001/fhir',
        hl7: 'http://localhost:8002/hl7'
      },
      SECURITY: {
        enableHIPAA: true,
        enableGDPR: true,
        enableLGPD: true
      }
    },

    retries: {
      runMode: 2,
      openMode: 0
    },

    experimentalSessionAndOrigin: true,
    chromeWebSecurity: false
  },

  component: {
    devServer: {
      framework: 'angular',
      bundler: 'webpack'
    },
    specPattern: 'src/**/*.cy.ts'
  },

  // TypeScript configuration
  compilerOptions: {
    ...compilerOptions,
    types: [
      'cypress',
      'node',
      '@faker-js/faker',
      'cypress-axe'
    ]
  }
});