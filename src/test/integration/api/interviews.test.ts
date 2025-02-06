/**
 * @fileoverview Integration tests for medical interview API endpoints
 * Implements HIPAA-compliant testing for video interviews and scheduling
 * @version 1.0.0
 */

import { describe, beforeEach, it, expect } from 'jest';
import supertest from 'supertest';
import { VideoClient } from '@vonage/video';
import { 
  setupTestEnvironment, 
  createAuthenticatedClient,
  waitForAsyncOperation 
} from '../../utils/test-helpers';
import { UserRole, Language } from '../../../web/src/app/core/interfaces/user.interface';
import { EnrollmentStatus } from '../../../web/src/app/core/interfaces/enrollment.interface';

// Global test configuration
const API_BASE_URL = 'http://localhost:8000/api/v1';
const TEST_TIMEOUT = 10000;
const SUPPORTED_LANGUAGES = ['en-US', 'pt-BR', 'es-ES'];

describe('Medical Interview API Integration Tests', () => {
  let testEnv: any;
  let individualClient: any;
  let interviewerClient: any;
  let adminClient: any;
  let videoClient: VideoClient;
  let testEnrollment: any;

  beforeEach(async () => {
    // Setup clean test environment with HIPAA compliance
    testEnv = await setupTestEnvironment({
      cleanupEnabled: true,
      timeouts: { request: 5000 }
    });

    // Create authenticated clients for different roles
    const individual = await createAuthenticatedClient(UserRole.Individual);
    const interviewer = await createAuthenticatedClient(UserRole.Interviewer);
    const admin = await createAuthenticatedClient(UserRole.Admin);

    individualClient = individual.client;
    interviewerClient = interviewer.client;
    adminClient = admin.client;

    // Initialize Vonage video client with test credentials
    videoClient = new VideoClient({
      apiKey: process.env.TEST_VONAGE_API_KEY,
      apiSecret: process.env.TEST_VONAGE_API_SECRET
    });

    // Create test enrollment in appropriate state
    testEnrollment = await testEnv.createTestEnrollment(
      individual.user,
      EnrollmentStatus.HEALTH_DECLARATION_PENDING
    );
  }, TEST_TIMEOUT);

  describe('Interview Scheduling', () => {
    it('should successfully schedule an interview with valid data', async () => {
      const schedulingData = {
        enrollment_id: testEnrollment.id,
        interviewer_id: interviewerClient.user.id,
        scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        language: Language.Portuguese,
        timezone: 'America/Sao_Paulo'
      };

      const response = await individualClient
        .post(`${API_BASE_URL}/interviews`)
        .send(schedulingData)
        .expect(201);

      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          id: expect.any(String),
          enrollment_id: testEnrollment.id,
          interviewer_id: interviewerClient.user.id,
          status: 'scheduled',
          video_session_id: expect.any(String)
        }
      });

      // Verify enrollment status update
      const enrollment = await individualClient
        .get(`${API_BASE_URL}/enrollments/${testEnrollment.id}`)
        .expect(200);

      expect(enrollment.body.data.status).toBe(EnrollmentStatus.INTERVIEW_SCHEDULED);
    });

    it('should enforce HIPAA compliance in interview data', async () => {
      const response = await interviewerClient
        .get(`${API_BASE_URL}/interviews/${testEnrollment.id}`)
        .expect(200);

      expect(response.headers).toMatchObject({
        'x-hipaa-compliance': 'enabled',
        'x-phi-handling': 'encrypted'
      });

      expect(response.body.data).toMatchObject({
        phi_access_logged: true,
        encryption_status: 'encrypted'
      });
    });

    it('should handle multi-language interview scheduling', async () => {
      for (const language of SUPPORTED_LANGUAGES) {
        const schedulingData = {
          enrollment_id: testEnrollment.id,
          interviewer_id: interviewerClient.user.id,
          scheduled_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          language,
          timezone: 'America/Sao_Paulo'
        };

        const response = await individualClient
          .post(`${API_BASE_URL}/interviews`)
          .set('Accept-Language', language)
          .send(schedulingData)
          .expect(201);

        expect(response.body.data.language).toBe(language);
        expect(response.body.data.localization_ready).toBe(true);
      }
    });
  });

  describe('Video Session Management', () => {
    let testInterview: any;

    beforeEach(async () => {
      // Create test interview
      testInterview = await interviewerClient
        .post(`${API_BASE_URL}/interviews`)
        .send({
          enrollment_id: testEnrollment.id,
          scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        })
        .expect(201);
    });

    it('should generate secure video session tokens', async () => {
      const response = await individualClient
        .post(`${API_BASE_URL}/interviews/${testInterview.body.data.id}/token`)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        data: {
          token: expect.any(String),
          session_id: expect.any(String),
          expires_at: expect.any(String)
        }
      });

      // Verify token with Vonage API
      const tokenValid = await videoClient.validateToken(response.body.data.token);
      expect(tokenValid).toBe(true);
    });

    it('should enforce secure video session access', async () => {
      // Attempt access without proper role
      const unauthorizedClient = await createAuthenticatedClient(UserRole.Broker);
      await unauthorizedClient.client
        .post(`${API_BASE_URL}/interviews/${testInterview.body.data.id}/token`)
        .expect(403);

      // Verify audit logging of access attempts
      const auditLog = await adminClient
        .get(`${API_BASE_URL}/audit-logs`)
        .query({ resource_id: testInterview.body.data.id })
        .expect(200);

      expect(auditLog.body.data).toContainEqual(
        expect.objectContaining({
          action: 'token_request',
          status: 'denied'
        })
      );
    });
  });

  describe('Interview Workflow', () => {
    it('should properly track interview completion', async () => {
      // Create and complete test interview
      const interview = await interviewerClient
        .post(`${API_BASE_URL}/interviews`)
        .send({
          enrollment_id: testEnrollment.id,
          scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        })
        .expect(201);

      // Complete interview
      await interviewerClient
        .patch(`${API_BASE_URL}/interviews/${interview.body.data.id}`)
        .send({
          status: 'completed',
          notes: 'Interview completed successfully',
          health_assessment: {
            approved: true,
            comments: 'No health concerns identified'
          }
        })
        .expect(200);

      // Verify enrollment status update
      const enrollment = await individualClient
        .get(`${API_BASE_URL}/enrollments/${testEnrollment.id}`)
        .expect(200);

      expect(enrollment.body.data.status).toBe(EnrollmentStatus.INTERVIEW_COMPLETED);
    });

    it('should handle interview rescheduling', async () => {
      const interview = await interviewerClient
        .post(`${API_BASE_URL}/interviews`)
        .send({
          enrollment_id: testEnrollment.id,
          scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        })
        .expect(201);

      // Reschedule interview
      const newDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      await interviewerClient
        .patch(`${API_BASE_URL}/interviews/${interview.body.data.id}/reschedule`)
        .send({
          scheduled_at: newDate,
          reason: 'Interviewer unavailable'
        })
        .expect(200);

      // Verify rescheduling notification
      await waitForAsyncOperation(async () => {
        const notifications = await individualClient
          .get(`${API_BASE_URL}/notifications`)
          .expect(200);

        return notifications.body.data.some((n: any) => 
          n.type === 'interview_rescheduled' && 
          n.interview_id === interview.body.data.id
        );
      });
    });
  });
});