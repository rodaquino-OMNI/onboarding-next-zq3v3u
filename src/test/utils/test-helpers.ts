/**
 * @fileoverview Test helper utilities for healthcare enrollment system
 * Implements HIPAA-compliant test environment setup and data management
 * @version 1.0.0
 */

import knex, { Knex } from 'knex'; // ^2.4.0
import jwt from 'jsonwebtoken'; // ^9.0.0
import { APIClient } from './api-client';
import { 
  generateUser, 
  generateEnrollment, 
  generateDocument 
} from './data-generators';
import { cleanDatabase } from './db-cleaner';
import { 
  User, 
  UserRole, 
  Language 
} from '../../web/src/app/core/interfaces/user.interface';
import { 
  Enrollment, 
  EnrollmentStatus 
} from '../../web/src/app/core/interfaces/enrollment.interface';
import { DocumentType } from '../../web/src/app/core/interfaces/document.interface';

// Global test configuration constants
export const TEST_TIMEOUT = 30000;
export const DEFAULT_TEST_USER = {
  email: 'test@example.com',
  password: 'Test123!',
  role: 'user'
};
export const TEST_DATA_PREFIX = 'TEST_';

/**
 * Test environment configuration interface
 */
interface TestConfig {
  dbConfig?: Knex.Config;
  apiUrl?: string;
  jwtSecret?: string;
  cleanupEnabled?: boolean;
  timeouts?: {
    setup?: number;
    cleanup?: number;
    request?: number;
  };
}

/**
 * Test environment state interface
 */
interface TestEnvironment {
  db: Knex;
  apiClient: APIClient;
  config: TestConfig;
  cleanup: () => Promise<void>;
}

/**
 * Sets up test environment with database and API client
 * @param config Optional test configuration
 * @returns Initialized test environment
 */
export async function setupTestEnvironment(config?: TestConfig): Promise<TestEnvironment> {
  // Default configuration
  const defaultConfig: TestConfig = {
    dbConfig: {
      client: 'mysql2',
      connection: {
        host: process.env.TEST_DB_HOST || 'localhost',
        port: parseInt(process.env.TEST_DB_PORT || '3306'),
        user: process.env.TEST_DB_USER || 'test',
        password: process.env.TEST_DB_PASSWORD || 'test',
        database: process.env.TEST_DB_NAME || 'test'
      },
      pool: { min: 0, max: 5 }
    },
    apiUrl: process.env.TEST_API_URL || 'http://localhost:8000/api/v1',
    jwtSecret: process.env.TEST_JWT_SECRET || 'test-secret',
    cleanupEnabled: true,
    timeouts: {
      setup: 10000,
      cleanup: 5000,
      request: 5000
    }
  };

  const finalConfig = { ...defaultConfig, ...config };

  try {
    // Initialize database connection
    const db = knex(finalConfig.dbConfig!);
    await db.raw('SELECT 1'); // Verify connection

    // Clean existing test data if enabled
    if (finalConfig.cleanupEnabled) {
      await cleanDatabase(db);
    }

    // Initialize API client
    const apiClient = new APIClient(finalConfig.apiUrl, {
      timeout: finalConfig.timeouts?.request
    });

    return {
      db,
      apiClient,
      config: finalConfig,
      cleanup: async () => {
        await teardownTestEnvironment({ db, apiClient, config: finalConfig, cleanup: async () => {} });
      }
    };
  } catch (error) {
    throw new Error(`Failed to setup test environment: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Tears down test environment and cleans up resources
 * @param env Test environment to teardown
 */
export async function teardownTestEnvironment(env: TestEnvironment): Promise<void> {
  try {
    if (env.config.cleanupEnabled) {
      await cleanDatabase(env.db);
    }
    await env.db.destroy();
  } catch (error) {
    console.error('Error during test environment teardown:', error);
    throw error;
  }
}

/**
 * Creates a test user with authentication token
 * @param role Optional user role
 * @param options Optional user creation options
 * @returns Created user with auth token
 */
export async function createTestUser(
  role: UserRole = UserRole.Individual,
  options?: { language?: Language }
): Promise<{ user: User; token: string; permissions: string[] }> {
  const user = generateUser(role, options?.language || Language.English);
  
  const permissions = {
    [UserRole.Individual]: ['enrollment:create', 'enrollment:read'],
    [UserRole.Broker]: ['enrollment:create', 'enrollment:read', 'enrollment:update'],
    [UserRole.Interviewer]: ['interview:create', 'interview:read', 'interview:update'],
    [UserRole.Admin]: ['*']
  }[role];

  const token = jwt.sign(
    { 
      sub: user.id,
      role,
      permissions 
    },
    process.env.TEST_JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );

  return { user, token, permissions };
}

/**
 * Creates a test enrollment with associated data
 * @param user Owner of the enrollment
 * @param status Optional enrollment status
 * @param options Optional enrollment creation options
 * @returns Created enrollment with associated data
 */
export async function createTestEnrollment(
  user: User,
  status: EnrollmentStatus = EnrollmentStatus.DRAFT,
  options?: {
    includeDocuments?: boolean;
    documentTypes?: DocumentType[];
  }
): Promise<Enrollment> {
  const enrollment = generateEnrollment(status, user);

  if (options?.includeDocuments) {
    const documentTypes = options.documentTypes || [
      DocumentType.ID_DOCUMENT,
      DocumentType.PROOF_OF_ADDRESS,
      DocumentType.HEALTH_DECLARATION
    ];

    enrollment.documents = documentTypes.map(type => 
      generateDocument(enrollment, type)
    );
  }

  return enrollment;
}

/**
 * Waits for async operations to complete
 * @param timeout Optional timeout in milliseconds
 * @param options Optional wait configuration
 * @returns Processing result status
 */
export async function waitForProcessing(
  timeout: number = 5000,
  options?: {
    checkInterval?: number;
    successCondition?: () => Promise<boolean>;
  }
): Promise<{ success: boolean; duration: number }> {
  const startTime = Date.now();
  const interval = options?.checkInterval || 500;

  const checkCondition = options?.successCondition || (async () => true);

  while (Date.now() - startTime < timeout) {
    if (await checkCondition()) {
      return {
        success: true,
        duration: Date.now() - startTime
      };
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  return {
    success: false,
    duration: Date.now() - startTime
  };
}