/**
 * @fileoverview Health check monitoring test suite
 * Implements comprehensive testing of system health endpoints and monitoring
 * @version 1.0.0
 */

import { describe, it, beforeEach, afterEach, expect } from 'jest';
import { APIClient } from '../../test/utils/api-client';
import { setupTestEnvironment, waitForAsyncOperation } from '../../test/utils/test-helpers';

// Global constants for health check configuration
const API_BASE_URL = 'http://localhost:8000/api/v1';
const HEALTH_CHECK_TIMEOUT = 5000;
const PERFORMANCE_THRESHOLDS = {
  responseTime: 200, // milliseconds
  cpuUsage: 80, // percentage
  memoryUsage: 75, // percentage
  cacheHitRate: 90, // percentage
  dbConnectionPool: 80 // percentage
};

// Test environment state
let apiClient: APIClient;
let testEnv: any;

describe('Health Check Monitoring', () => {
  beforeEach(async () => {
    testEnv = await setupTestEnvironment({
      apiUrl: API_BASE_URL,
      timeouts: { request: HEALTH_CHECK_TIMEOUT }
    });
    apiClient = testEnv.apiClient;
  });

  afterEach(async () => {
    await testEnv.cleanup();
  });

  describe('API Health', () => {
    it('should return healthy status with required HIPAA headers', async () => {
      const startTime = Date.now();
      const response = await apiClient.get('/health');
      const responseTime = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(response.headers['x-hipaa-compliance']).toBe('enabled');
      expect(responseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.responseTime);

      expect(response.data).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        version: expect.any(String),
        services: expect.any(Object)
      });
    });

    it('should include detailed component health status', async () => {
      const response = await apiClient.get('/health/details');

      expect(response.data.components).toMatchObject({
        api: { status: expect.any(String) },
        database: { status: expect.any(String) },
        cache: { status: expect.any(String) },
        storage: { status: expect.any(String) }
      });

      expect(response.data.metrics).toMatchObject({
        uptime: expect.any(Number),
        responseTime: expect.any(Number),
        cpuUsage: expect.any(Number),
        memoryUsage: expect.any(Number)
      });
    });

    it('should validate performance metrics against thresholds', async () => {
      const response = await apiClient.get('/health/metrics');

      expect(response.data.metrics.cpuUsage).toBeLessThan(PERFORMANCE_THRESHOLDS.cpuUsage);
      expect(response.data.metrics.memoryUsage).toBeLessThan(PERFORMANCE_THRESHOLDS.memoryUsage);
      expect(response.data.metrics.cacheHitRate).toBeGreaterThan(PERFORMANCE_THRESHOLDS.cacheHitRate);
    });
  });

  describe('Database Health', () => {
    it('should verify database connectivity and replication status', async () => {
      const response = await apiClient.get('/health/database');

      expect(response.data).toMatchObject({
        status: 'healthy',
        primary: {
          connected: true,
          latency: expect.any(Number)
        },
        replica: {
          connected: true,
          latency: expect.any(Number),
          replicationLag: expect.any(Number)
        },
        connectionPool: {
          active: expect.any(Number),
          idle: expect.any(Number),
          waiting: expect.any(Number)
        }
      });

      expect(response.data.connectionPool.active)
        .toBeLessThan(PERFORMANCE_THRESHOLDS.dbConnectionPool);
    });

    it('should validate database backup status', async () => {
      const response = await apiClient.get('/health/database/backup');

      expect(response.data).toMatchObject({
        lastBackupTime: expect.any(String),
        backupStatus: 'success',
        retentionDays: expect.any(Number),
        backupSize: expect.any(Number)
      });
    });
  });

  describe('Redis Cache Health', () => {
    it('should verify Redis cluster health and metrics', async () => {
      const response = await apiClient.get('/health/cache');

      expect(response.data).toMatchObject({
        status: 'healthy',
        cluster: {
          nodes: expect.any(Array),
          masterNodes: expect.any(Number),
          replicaNodes: expect.any(Number)
        },
        metrics: {
          hitRate: expect.any(Number),
          memoryUsage: expect.any(Number),
          connectedClients: expect.any(Number),
          evictedKeys: expect.any(Number)
        }
      });

      expect(response.data.metrics.hitRate)
        .toBeGreaterThan(PERFORMANCE_THRESHOLDS.cacheHitRate);
    });
  });

  describe('External Services Health', () => {
    it('should verify AWS services connectivity', async () => {
      const response = await apiClient.get('/health/external/aws');

      expect(response.data).toMatchObject({
        s3: { status: 'healthy', latency: expect.any(Number) },
        ses: { status: 'healthy', latency: expect.any(Number) },
        textract: { status: 'healthy', latency: expect.any(Number) }
      });
    });

    it('should verify Vonage video service health', async () => {
      const response = await apiClient.get('/health/external/vonage');

      expect(response.data).toMatchObject({
        status: 'healthy',
        apiLatency: expect.any(Number),
        activeConnections: expect.any(Number),
        serviceQuality: expect.any(Number)
      });
    });

    it('should verify EMR integration status', async () => {
      const response = await apiClient.get('/health/external/emr');

      expect(response.data).toMatchObject({
        status: 'healthy',
        connections: expect.arrayContaining([{
          provider: expect.any(String),
          status: 'connected',
          latency: expect.any(Number)
        }])
      });
    });
  });

  describe('System Recovery', () => {
    it('should verify system recovery after simulated failure', async () => {
      // Simulate component failure
      await apiClient.post('/health/test/failure', {
        component: 'cache',
        duration: 5000
      });

      // Wait for recovery
      const { success, duration } = await waitForAsyncOperation(10000, {
        checkInterval: 500,
        successCondition: async () => {
          const response = await apiClient.get('/health/cache');
          return response.data.status === 'healthy';
        }
      });

      expect(success).toBe(true);
      expect(duration).toBeLessThan(10000);
    });
  });
});

// Export health check test functions for external use
export const healthCheckTests = {
  testApiHealth: async () => {
    const response = await apiClient.get('/health');
    return response.data.status === 'healthy';
  },
  testDatabaseHealth: async () => {
    const response = await apiClient.get('/health/database');
    return response.data.status === 'healthy';
  },
  testRedisHealth: async () => {
    const response = await apiClient.get('/health/cache');
    return response.data.status === 'healthy';
  },
  testExternalServicesHealth: async () => {
    const response = await apiClient.get('/health/external');
    return Object.values(response.data).every(service => service.status === 'healthy');
  }
};