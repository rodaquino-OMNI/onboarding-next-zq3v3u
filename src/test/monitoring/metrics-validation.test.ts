/**
 * @fileoverview Comprehensive test suite for validating system metrics collection and monitoring
 * Implements HIPAA-compliant validation of application, infrastructure and business metrics
 * @version 1.0.0
 */

import { setupTestEnvironment } from '../utils/test-helpers';
import APIClient from '../utils/api-client';
import { jest } from '@jest/globals';
import supertest from 'supertest';

// Constants for metrics validation
const METRICS_ENDPOINT = '/api/v1/metrics';
const METRICS_REFRESH_INTERVAL = 60000; // 1 minute
const METRIC_TIMEOUT = 5000; // 5 seconds
const SLA_RESPONSE_TIME = 1000; // 1 second

/**
 * Validates metric format and HIPAA compliance
 */
function validateMetricFormat(metric: any, checkHIPAA: boolean = true): boolean {
  // Verify Prometheus format
  if (!metric.name || !metric.value || !metric.timestamp) {
    return false;
  }

  // Validate metric naming convention
  if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(metric.name)) {
    return false;
  }

  // Verify metric type
  if (!['counter', 'gauge', 'histogram'].includes(metric.type)) {
    return false;
  }

  // Check HIPAA compliance if required
  if (checkHIPAA) {
    // Ensure no PHI in labels
    if (metric.labels) {
      const labelValues = Object.values(metric.labels);
      const containsPHI = labelValues.some((value: any) => 
        typeof value === 'string' && /\b\d{3}-\d{2}-\d{4}\b/.test(value)
      );
      if (containsPHI) return false;
    }
  }

  return true;
}

/**
 * Waits for metric update with timeout
 */
async function waitForMetricUpdate(
  metricName: string,
  expectedValue: number,
  timeout: number = METRIC_TIMEOUT
): Promise<boolean> {
  const startTime = Date.now();
  let currentInterval = 100;

  while (Date.now() - startTime < timeout) {
    try {
      const response = await supertest(METRICS_ENDPOINT)
        .get(`/${metricName}`)
        .expect(200);

      if (response.body.value === expectedValue) {
        return true;
      }

      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, currentInterval));
      currentInterval = Math.min(currentInterval * 2, 1000);
    } catch (error) {
      console.error(`Error polling metric ${metricName}:`, error);
    }
  }

  return false;
}

/**
 * Comprehensive metrics validation test suite
 */
export class MetricsValidationTest {
  private apiClient: APIClient;
  private testMetrics: Map<string, number>;
  private metricsConfig: any;

  constructor(config: any) {
    this.apiClient = new APIClient();
    this.testMetrics = new Map();
    this.metricsConfig = config;
  }

  /**
   * Tests application-level metrics collection and validation
   */
  async testApplicationMetrics(): Promise<void> {
    describe('Application Metrics Validation', () => {
      beforeAll(async () => {
        await setupTestEnvironment();
      });

      test('should validate P95 response time metrics', async () => {
        const metric = await this.apiClient.getMetrics('http_request_duration_seconds');
        expect(validateMetricFormat(metric, true)).toBe(true);
        expect(metric.value).toBeLessThan(SLA_RESPONSE_TIME / 1000); // Convert to seconds
      });

      test('should track error rate metrics by endpoint', async () => {
        const metrics = await this.apiClient.getMetrics('http_errors_total');
        expect(metrics.every((m: any) => validateMetricFormat(m, true))).toBe(true);
        
        // Verify error rate is within SLA
        const totalErrors = metrics.reduce((sum: number, m: any) => sum + m.value, 0);
        const totalRequests = await this.apiClient.getMetrics('http_requests_total');
        const errorRate = totalErrors / totalRequests.value;
        expect(errorRate).toBeLessThan(0.01); // Less than 1% error rate
      });

      test('should monitor concurrent user metrics', async () => {
        const metric = await this.apiClient.getMetrics('active_users_total');
        expect(validateMetricFormat(metric, true)).toBe(true);
        expect(typeof metric.value).toBe('number');
      });

      test('should track API endpoint latency', async () => {
        const metrics = await this.apiClient.getMetrics('api_latency_seconds');
        expect(metrics.every((m: any) => validateMetricFormat(m, true))).toBe(true);
        
        // Verify critical endpoints meet SLA
        const criticalEndpoints = ['/enrollments', '/documents', '/interviews'];
        for (const endpoint of criticalEndpoints) {
          const endpointMetric = metrics.find((m: any) => m.labels.endpoint === endpoint);
          expect(endpointMetric?.value).toBeLessThan(SLA_RESPONSE_TIME / 1000);
        }
      });
    });
  }

  /**
   * Tests infrastructure metrics collection and validation
   */
  async testInfrastructureMetrics(): Promise<void> {
    describe('Infrastructure Metrics Validation', () => {
      test('should monitor CPU usage metrics', async () => {
        const metrics = await this.apiClient.getMetrics('process_cpu_seconds_total');
        expect(metrics.every((m: any) => validateMetricFormat(m, false))).toBe(true);
        
        // Verify CPU usage is within limits
        for (const metric of metrics) {
          expect(metric.value).toBeLessThan(0.8); // Less than 80% CPU usage
        }
      });

      test('should track memory usage metrics', async () => {
        const metrics = await this.apiClient.getMetrics('process_resident_memory_bytes');
        expect(metrics.every((m: any) => validateMetricFormat(m, false))).toBe(true);
        
        // Verify memory usage is within limits
        const memoryLimit = 2 * 1024 * 1024 * 1024; // 2GB
        for (const metric of metrics) {
          expect(metric.value).toBeLessThan(memoryLimit);
        }
      });

      test('should monitor database connection pool', async () => {
        const metrics = await this.apiClient.getMetrics('db_connections_total');
        expect(metrics.every((m: any) => validateMetricFormat(m, false))).toBe(true);
        
        // Verify connection pool limits
        const maxConnections = 200;
        for (const metric of metrics) {
          expect(metric.value).toBeLessThan(maxConnections);
        }
      });

      test('should track cache hit rates', async () => {
        const hits = await this.apiClient.getMetrics('cache_hits_total');
        const misses = await this.apiClient.getMetrics('cache_misses_total');
        
        expect(validateMetricFormat(hits, false)).toBe(true);
        expect(validateMetricFormat(misses, false)).toBe(true);
        
        // Calculate and verify cache hit rate
        const hitRate = hits.value / (hits.value + misses.value);
        expect(hitRate).toBeGreaterThan(0.8); // Greater than 80% hit rate
      });
    });
  }

  /**
   * Tests business metrics collection and validation
   */
  async testBusinessMetrics(): Promise<void> {
    describe('Business Metrics Validation', () => {
      test('should track enrollment completion rates', async () => {
        const metrics = await this.apiClient.getMetrics('enrollment_completion_rate');
        expect(metrics.every((m: any) => validateMetricFormat(m, true))).toBe(true);
        
        // Verify completion rate meets target
        const overallRate = metrics.find((m: any) => !m.labels.stage);
        expect(overallRate?.value).toBeGreaterThan(0.9); // Greater than 90%
      });

      test('should monitor document processing metrics', async () => {
        const metrics = await this.apiClient.getMetrics('document_processing_duration_seconds');
        expect(metrics.every((m: any) => validateMetricFormat(m, true))).toBe(true);
        
        // Verify processing time SLA
        for (const metric of metrics) {
          expect(metric.value).toBeLessThan(30); // Less than 30 seconds
        }
      });

      test('should track interview success rates', async () => {
        const metric = await this.apiClient.getMetrics('interview_success_rate');
        expect(validateMetricFormat(metric, true)).toBe(true);
        expect(metric.value).toBeGreaterThan(0.85); // Greater than 85% success
      });

      test('should monitor enrollment processing time', async () => {
        const metric = await this.apiClient.getMetrics('enrollment_processing_duration_seconds');
        expect(validateMetricFormat(metric, true)).toBe(true);
        
        // Verify against SLA target (75% reduction)
        const baselineTime = 7 * 24 * 60 * 60; // 7 days in seconds
        const targetTime = baselineTime * 0.25; // 75% reduction
        expect(metric.value).toBeLessThan(targetTime);
      });
    });
  }
}

export default MetricsValidationTest;