import { EnrollmentCompleted } from '../../backend/app/Notifications/EnrollmentCompleted';
import { InterviewScheduled } from '../../backend/app/Notifications/InterviewScheduled';
import { Mock } from '@types/jest';

/**
 * Enhanced mock email service for testing email notifications with HIPAA compliance
 * and performance testing capabilities.
 * @version 1.0.0
 */
export class MockEmailService {
  // Track sent emails for verification
  private sentEmails: Array<{
    type: string;
    recipient: string;
    content: any;
    metadata: any;
  }> = [];

  // Control failure scenarios
  private shouldFail: boolean = false;

  // Simulate network latency
  private simulatedLatency: number = 0;

  // Audit log for compliance tracking
  private auditLog: Array<{
    action: string;
    timestamp: Date;
    details: any;
  }> = [];

  // Mock encryption keys for sensitive data
  private encryptionKeys: Map<string, string> = new Map();

  /**
   * Initialize the mock email service
   */
  constructor() {
    this.encryptionKeys.set('default', 'mock-encryption-key');
    this.logAudit('service_initialized', {});
  }

  /**
   * Mock sending enrollment completion email with HIPAA compliance
   * @param enrollment - Enrollment data
   * @param recipientEmail - Recipient email address
   * @param language - Email language preference
   * @returns Promise<boolean> - Success status
   */
  async sendEnrollmentCompletedEmail(
    enrollment: any,
    recipientEmail: string,
    language: string = 'en'
  ): Promise<boolean> {
    try {
      // Validate HIPAA compliance
      this.validateHIPAACompliance(enrollment);

      // Simulate encryption
      const encryptedContent = this.encryptSensitiveData(enrollment);

      // Check failure scenario
      if (this.shouldFail) {
        throw new Error('Simulated email sending failure');
      }

      // Simulate network latency
      await this.simulateLatency();

      // Create email content using EnrollmentCompleted notification
      const emailContent = {
        subject: `Enrollment Completed - ID: ${this.maskSensitiveData(enrollment.id)}`,
        body: this.sanitizeContent({
          enrollment: encryptedContent,
          language,
          timestamp: new Date().toISOString()
        })
      };

      // Store sent email for verification
      this.sentEmails.push({
        type: 'enrollment_completed',
        recipient: this.hashEmail(recipientEmail),
        content: emailContent,
        metadata: {
          language,
          timestamp: new Date(),
          hipaaCompliant: true
        }
      });

      // Log to audit trail
      this.logAudit('email_sent', {
        type: 'enrollment_completed',
        recipient: this.hashEmail(recipientEmail),
        language
      });

      return true;
    } catch (error) {
      this.logAudit('email_failed', {
        error: error.message,
        type: 'enrollment_completed'
      });
      throw error;
    }
  }

  /**
   * Mock sending interview scheduling email with HIPAA compliance
   * @param interview - Interview data
   * @param recipientEmail - Recipient email address
   * @param language - Email language preference
   * @returns Promise<boolean> - Success status
   */
  async sendInterviewScheduledEmail(
    interview: any,
    recipientEmail: string,
    language: string = 'en'
  ): Promise<boolean> {
    try {
      // Validate HIPAA compliance
      this.validateHIPAACompliance(interview);

      // Simulate encryption
      const encryptedContent = this.encryptSensitiveData(interview);

      // Check failure scenario
      if (this.shouldFail) {
        throw new Error('Simulated email sending failure');
      }

      // Simulate network latency
      await this.simulateLatency();

      // Create email content using InterviewScheduled notification
      const emailContent = {
        subject: `Interview Scheduled - ID: ${this.maskSensitiveData(interview.id)}`,
        body: this.sanitizeContent({
          interview: encryptedContent,
          language,
          timestamp: new Date().toISOString()
        })
      };

      // Store sent email for verification
      this.sentEmails.push({
        type: 'interview_scheduled',
        recipient: this.hashEmail(recipientEmail),
        content: emailContent,
        metadata: {
          language,
          timestamp: new Date(),
          hipaaCompliant: true
        }
      });

      // Log to audit trail
      this.logAudit('email_sent', {
        type: 'interview_scheduled',
        recipient: this.hashEmail(recipientEmail),
        language
      });

      return true;
    } catch (error) {
      this.logAudit('email_failed', {
        error: error.message,
        type: 'interview_scheduled'
      });
      throw error;
    }
  }

  /**
   * Set simulated network latency for performance testing
   * @param milliseconds - Latency in milliseconds
   */
  setSimulatedLatency(milliseconds: number): void {
    if (milliseconds < 0) {
      throw new Error('Latency cannot be negative');
    }
    this.simulatedLatency = milliseconds;
    this.logAudit('latency_set', { milliseconds });
  }

  /**
   * Set failure mode for testing error scenarios
   * @param shouldFail - Whether emails should fail to send
   */
  setShouldFail(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
    this.logAudit('failure_mode_set', { shouldFail });
  }

  /**
   * Get sent emails for verification
   * @returns Array of sent emails
   */
  getSentEmails(): Array<any> {
    return this.sentEmails;
  }

  /**
   * Get audit log for compliance verification
   * @returns Array of audit log entries
   */
  getAuditLog(): Array<any> {
    return this.auditLog;
  }

  /**
   * Clear sent emails and audit log
   */
  reset(): void {
    this.sentEmails = [];
    this.auditLog = [];
    this.shouldFail = false;
    this.simulatedLatency = 0;
    this.logAudit('service_reset', {});
  }

  /**
   * Validate HIPAA compliance of email content
   * @param content - Content to validate
   * @private
   */
  private validateHIPAACompliance(content: any): void {
    const sensitivePatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{10}\b/, // Account numbers
      /\b[A-Z]{2}\d{6}\b/ // Medical record numbers
    ];

    const contentString = JSON.stringify(content);
    for (const pattern of sensitivePatterns) {
      if (pattern.test(contentString)) {
        throw new Error('Content contains unencrypted sensitive data');
      }
    }
  }

  /**
   * Simulate network latency
   * @private
   */
  private async simulateLatency(): Promise<void> {
    if (this.simulatedLatency > 0) {
      await new Promise(resolve => setTimeout(resolve, this.simulatedLatency));
    }
  }

  /**
   * Log to audit trail
   * @param action - Audit action
   * @param details - Audit details
   * @private
   */
  private logAudit(action: string, details: any): void {
    this.auditLog.push({
      action,
      timestamp: new Date(),
      details: {
        ...details,
        environment: 'test'
      }
    });
  }

  /**
   * Hash email address for privacy
   * @param email - Email to hash
   * @private
   */
  private hashEmail(email: string): string {
    return `${email.split('@')[0].substring(0, 2)}***@${email.split('@')[1]}`;
  }

  /**
   * Encrypt sensitive data
   * @param data - Data to encrypt
   * @private
   */
  private encryptSensitiveData(data: any): any {
    const encryptionKey = this.encryptionKeys.get('default');
    return {
      ...data,
      encrypted: true,
      key_id: encryptionKey
    };
  }

  /**
   * Mask sensitive data in content
   * @param content - Content to mask
   * @private
   */
  private maskSensitiveData(content: string): string {
    return content.substring(0, 4) + '****';
  }

  /**
   * Sanitize content for HIPAA compliance
   * @param content - Content to sanitize
   * @private
   */
  private sanitizeContent(content: any): any {
    const sanitized = { ...content };
    delete sanitized.ssn;
    delete sanitized.medicalData;
    delete sanitized.healthRecords;
    return sanitized;
  }
}