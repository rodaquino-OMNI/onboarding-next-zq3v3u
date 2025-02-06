// Angular Testing Environment Configuration v15.0.0
import { getTestBed, TestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting
} from '@angular/platform-browser-dynamic/testing';

// Prevent Karma from running prematurely
declare const require: {
  context(path: string, deep?: boolean, filter?: RegExp): {
    <T>(id: string): T;
    keys(): string[];
  };
};

// Karma configuration type
declare const __karma__: any;

// Zone.js configuration for async testing
declare const __zone_symbol__BLACK_LISTED_EVENTS: string[];

/**
 * Performance monitoring configuration for test execution
 */
const PERFORMANCE_CONFIG = {
  timeoutInterval: 10000,
  slowTestThreshold: 1000,
  memoryThreshold: 512 * 1024 * 1024, // 512MB
  batchSize: 50
};

/**
 * Test environment configuration and monitoring
 */
const configureTestEnvironment = (): boolean => {
  try {
    // Configure test timeouts and performance monitoring
    __karma__.config.timeoutInterval = PERFORMANCE_CONFIG.timeoutInterval;

    // Setup memory monitoring
    const memoryUsage = process.memoryUsage();
    if (memoryUsage.heapUsed > PERFORMANCE_CONFIG.memoryThreshold) {
      console.warn('High memory usage detected in test environment');
    }

    // Configure browser compatibility settings
    if (typeof window !== 'undefined') {
      window.console.error = (...args: any[]) => {
        __karma__.error(args.join(' '));
      };
    }

    return true;
  } catch (error) {
    console.error('Failed to configure test environment:', error);
    return false;
  }
};

/**
 * Initialize the Angular testing environment with error handling
 * and performance optimization
 */
const initTestEnvironment = (): void => {
  try {
    // First, initialize the Angular testing environment
    TestBed.initTestEnvironment(
      BrowserDynamicTestingModule,
      platformBrowserDynamicTesting(),
      {
        teardown: { destroyAfterEach: true }
      }
    );
  } catch (error) {
    if (!(error as any)?.message?.includes('TestBed is already initialized')) {
      console.error('Failed to initialize TestBed:', error);
      throw error;
    }
  }
};

/**
 * Require all test files with optimized loading and monitoring
 * @param context - Webpack context for test file discovery
 */
const requireAll = (context: any): void => {
  const startTime = Date.now();
  let loadedTests = 0;
  let failedTests = 0;

  try {
    const testFiles = context.keys();
    console.log(`Discovered ${testFiles.length} test files`);

    // Batch process test files for better performance
    for (let i = 0; i < testFiles.length; i += PERFORMANCE_CONFIG.batchSize) {
      const batch = testFiles.slice(i, i + PERFORMANCE_CONFIG.batchSize);
      
      batch.forEach((file: string) => {
        try {
          context(file);
          loadedTests++;
        } catch (error) {
          failedTests++;
          console.error(`Failed to load test file ${file}:`, error);
        }
      });

      // Memory cleanup after each batch
      if (global.gc) {
        global.gc();
      }
    }

    // Log test loading metrics
    const loadTime = Date.now() - startTime;
    console.log(`
      Test Loading Metrics:
      - Total files: ${testFiles.length}
      - Successfully loaded: ${loadedTests}
      - Failed to load: ${failedTests}
      - Loading time: ${loadTime}ms
    `);

  } catch (error) {
    console.error('Failed to require test files:', error);
    throw error;
  }
};

// Configure test environment
if (!configureTestEnvironment()) {
  throw new Error('Failed to configure test environment');
}

// Initialize testing environment
initTestEnvironment();

// Load all test files
const context = require.context('./', true, /\.spec\.ts$/);
requireAll(context);