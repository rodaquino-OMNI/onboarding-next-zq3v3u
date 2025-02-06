import type { Config } from '@jest/types';
import { defaults as tsjPreset } from 'ts-jest/presets';

// @jest/types version: ^29.0.0
// ts-jest version: ^29.0.0

const config: Config.InitialOptions = {
  // Base configuration
  preset: 'ts-jest',
  testEnvironment: 'node',
  verbose: true,
  
  // File extensions and paths
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  roots: ['<rootDir>/src/test'],
  testMatch: [
    '**/*.spec.ts',
    '**/*.test.ts',
    '**/integration/**/*.ts',
    '**/e2e/**/*.ts'
  ],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  
  // Module mapping for test imports
  moduleNameMapper: {
    '@test/(.*)': '<rootDir>/src/test/$1',
    '@e2e/(.*)': '<rootDir>/src/test/e2e/$1',
    '@integration/(.*)': '<rootDir>/src/test/integration/$1',
    '@utils/(.*)': '<rootDir>/src/test/utils/$1',
    '@i18n/(.*)': '<rootDir>/src/test/i18n/$1'
  },

  // Test setup and helpers
  setupFilesAfterEnv: [
    '<rootDir>/src/test/utils/test-helpers.ts',
    '<rootDir>/src/test/i18n/setup.ts'
  ],

  // Coverage configuration
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: [
    'text',
    'lcov',
    'json-summary',
    'html'
  ],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80
    }
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/test/**/*',
    '!src/**/index.ts',
    '!src/environments/**/*'
  ],

  // TypeScript configuration
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/src/test/tsconfig.json',
      diagnostics: true,
      isolatedModules: true
    }
  },

  // Reporters configuration
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'test-results/jest',
      outputName: 'junit.xml',
      ancestorSeparator: ' › ',
      uniqueOutputName: false,
      suiteNameTemplate: '{filepath}',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}'
    }]
  ],

  // Performance and execution settings
  testTimeout: 30000,
  maxWorkers: '50%'
};

export default config;