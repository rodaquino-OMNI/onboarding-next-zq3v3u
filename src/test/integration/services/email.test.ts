/**
 * @fileoverview Integration tests for email notification service
 * Implements HIPAA-compliant email testing with security and localization validation
 * @version 1.0.0
 */

import { setupTestEnvironment } from '../../utils/test-helpers';
import { mockApiResponse } from '../../utils/test-helpers';
import { createTestUser, createTestEnrollment, generateUser } from '../../utils/data-generators';
import { EmailCapture } from 'test-email-capture';
import { AuditLogger } from 'audit-logger';
import { 
  User,
  UserRole,
  Language
} from '../../../web/src/app/core/interfaces/user.interface';
import { 
  Enrollment,
  EnrollmentStatus,
  EnrollmentInterview
} from '../../../web/src/app/core/interfaces/enrollment.interface';

/**
 * Email notification service integration test suite
 * Tests HIPAA-compliant email delivery with security validation
 */
@testSuite('Email Notification Integration Tests')
export class EmailNotificationTests {
  private apiClient: any;
  private emailServiceSpy: jest.SpyInstance;
  private emailCapture: EmailCapture;
  private auditLogger: AuditLogger;
  private testUser: User;
  private testEnrollment: Enrollment;

  constructor() {
    jest.setTimeout(10000); // 10s timeout for email delivery
  }

  /**
   * Setup test environment before each test
   */
  async beforeEach(): Promise<void> {
    // Initialize test environment with security context
    const env = await setupTestEnvironment({
      cleanupEnabled: true,
      timeouts: { request: 5000 }
    });

    this.apiClient = env.apiClient;
    this.emailCapture = new EmailCapture();
    this.auditLogger = new AuditLogger({
      service: 'email-notification',
      compliance: ['HIPAA', 'GDPR']
    });

    // Create test user and enrollment
    this.testUser = await createTestUser(UserRole.Individual, {
      language: Language.English
    });
    this.testEnrollment = await createTestEnrollment(
      this.testUser,
      EnrollmentStatus.COMPLETED
    );

    // Setup email service spy
    this.emailServiceSpy = jest.spyOn(this.apiClient, 'sendEmail');
  }

  /**
   * Cleanup test environment after each test
   */
  async afterEach(): Promise<void> {
    await this.emailCapture.clear();
    await this.auditLogger.clear();
    this.emailServiceSpy.mockRestore();
  }

  /**
   * Tests enrollment completion email notification
   * Validates security, compliance and localization
   */
  @test()
  @timeout(10000)
  async testEnrollmentCompletionEmail(): Promise<void> {
    // Configure email capture
    await this.emailCapture.start();

    // Trigger enrollment completion notification
    const response = await this.apiClient.post(
      `/enrollments/${this.testEnrollment.id}/complete`,
      { userId: this.testUser.id }
    );

    expect(response.status).toBe(200);

    // Wait for email delivery
    const email = await this.emailCapture.waitForEmail({
      to: this.testUser.email,
      subject: /Enrollment Completed/i,
      timeout: 5000
    });

    // Verify email content and security
    expect(email).toBeDefined();
    expect(email.headers['x-hipaa-compliance']).toBe('enabled');
    expect(email.headers['content-type']).toContain('multipart/encrypted');

    // Verify email content localization
    if (this.testUser.preferences.language === Language.Portuguese) {
      expect(email.subject).toContain('Inscrição Concluída');
      expect(email.html).toContain('Sua inscrição foi concluída com sucesso');
    } else {
      expect(email.subject).toContain('Enrollment Completed');
      expect(email.html).toContain('Your enrollment has been successfully completed');
    }

    // Verify PHI protection
    expect(email.html).not.toContain(this.testUser.email);
    expect(email.html).not.toContain(this.testEnrollment.metadata.personal_info.ssn);

    // Verify audit logging
    const auditLogs = await this.auditLogger.getLogs({
      action: 'email_sent',
      resourceId: this.testEnrollment.id
    });

    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({
      action: 'email_sent',
      resourceType: 'enrollment',
      resourceId: this.testEnrollment.id,
      userId: this.testUser.id,
      metadata: {
        emailType: 'enrollment_completion',
        deliveryStatus: 'success'
      }
    });
  }

  /**
   * Tests interview scheduling email notification
   * Validates security and video session link handling
   */
  @test()
  @timeout(10000)
  async testInterviewScheduledEmail(): Promise<void> {
    // Setup test interview
    const interviewer = await createTestUser(UserRole.Interviewer);
    const interview: EnrollmentInterview = {
      id: 'test-interview-id',
      enrollment_id: this.testEnrollment.id,
      interviewer_id: interviewer.id,
      scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      status: 'scheduled',
      video_url: 'https://video-session.example.com/test-session'
    };

    // Configure email capture
    await this.emailCapture.start();

    // Schedule interview
    const response = await this.apiClient.post(
      `/enrollments/${this.testEnrollment.id}/interviews`,
      interview
    );

    expect(response.status).toBe(200);

    // Wait for email delivery
    const email = await this.emailCapture.waitForEmail({
      to: this.testUser.email,
      subject: /Interview Scheduled/i,
      timeout: 5000
    });

    // Verify email security
    expect(email).toBeDefined();
    expect(email.headers['x-hipaa-compliance']).toBe('enabled');
    expect(email.headers['content-type']).toContain('multipart/encrypted');

    // Verify secure video link
    expect(email.html).toContain('https://video-session.example.com');
    expect(email.html).toContain('encrypted-session-token');

    // Verify localization
    if (this.testUser.preferences.language === Language.Portuguese) {
      expect(email.subject).toContain('Entrevista Agendada');
      expect(email.html).toContain('Sua entrevista foi agendada');
    } else {
      expect(email.subject).toContain('Interview Scheduled');
      expect(email.html).toContain('Your interview has been scheduled');
    }

    // Verify audit logging
    const auditLogs = await this.auditLogger.getLogs({
      action: 'email_sent',
      resourceId: interview.id
    });

    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]).toMatchObject({
      action: 'email_sent',
      resourceType: 'interview',
      resourceId: interview.id,
      userId: this.testUser.id,
      metadata: {
        emailType: 'interview_scheduled',
        deliveryStatus: 'success',
        interviewerId: interviewer.id
      }
    });
  }
}