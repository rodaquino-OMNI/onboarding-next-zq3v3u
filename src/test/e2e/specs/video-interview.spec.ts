/**
 * @fileoverview End-to-end test specification for video interview feature
 * Implements HIPAA-compliant testing of medical interview sessions
 * @version 1.0.0
 */

import { test, expect, describe, beforeEach, afterEach } from '@jest/globals';
import { Page, Browser, ElementHandle } from '@playwright/test';
import { VonageClient } from '@vonage/server-sdk';
import { 
  setupTestEnvironment, 
  createAuthenticatedClient, 
  waitForAsyncOperation 
} from '../../utils/test-helpers';
import { UserRole, Language } from '../../../web/src/app/core/interfaces/user.interface';
import { EnrollmentStatus } from '../../../web/src/app/core/interfaces/enrollment.interface';

// Test configuration constants
const TEST_TIMEOUT = 30000;
const VIDEO_INTERVIEW_URL = '/interview-room';
const COMPLIANCE_CHECK_ENABLED = true;
const NETWORK_CONDITIONS = {
  latency: 100,
  downloadThroughput: 500000,
  uploadThroughput: 500000
};
const SUPPORTED_LANGUAGES = ['en-US', 'pt-BR', 'es-ES'];

// Video quality thresholds
const VIDEO_QUALITY_THRESHOLDS = {
  minBitrate: 600000,
  minFrameRate: 24,
  maxLatency: 200,
  minResolution: { width: 640, height: 480 }
};

describe('Video Interview E2E Tests', () => {
  let page: Page;
  let browser: Browser;
  let vonageClient: VonageClient;
  let testEnv: any;
  let interviewerToken: string;
  let enrolleeToken: string;

  beforeEach(async () => {
    // Initialize test environment with HIPAA compliance
    testEnv = await setupTestEnvironment({
      cleanupEnabled: true,
      hipaaCompliance: COMPLIANCE_CHECK_ENABLED
    });

    // Create authenticated interviewer
    const interviewer = await createAuthenticatedClient({
      role: UserRole.Interviewer,
      language: Language.English
    });
    interviewerToken = interviewer.token;

    // Create authenticated enrollee
    const enrollee = await createAuthenticatedClient({
      role: UserRole.Individual,
      language: Language.Portuguese
    });
    enrolleeToken = enrollee.token;

    // Initialize Vonage client for video testing
    vonageClient = new VonageClient({
      apiKey: process.env.VONAGE_API_KEY!,
      apiSecret: process.env.VONAGE_API_SECRET!
    });

    // Setup browser with security headers
    const context = await browser.newContext({
      httpCredentials: {
        username: process.env.TEST_AUTH_USER!,
        password: process.env.TEST_AUTH_PASS!
      },
      ignoreHTTPSErrors: false
    });

    page = await context.newPage();

    // Configure network conditions
    await page.route('**/*', route => {
      route.continue({
        networkConditions: NETWORK_CONDITIONS
      });
    });
  });

  afterEach(async () => {
    // Cleanup test resources
    await page.close();
    await testEnv.cleanup();

    // End video session and verify cleanup
    if (vonageClient) {
      await vonageClient.video.endSession({
        sessionId: page.evaluate(() => window.sessionId)
      });
    }

    // Clear browser storage and cookies
    const context = page.context();
    await context.clearCookies();
    await context.clearPermissions();
  });

  test('should complete full video interview flow with HIPAA compliance', async () => {
    // Navigate to interview room with language preference
    await page.goto(`${VIDEO_INTERVIEW_URL}?lang=pt-BR`);
    await page.waitForLoadState('networkidle');

    // Verify HIPAA compliance notice
    const hipaaNotice = await page.locator('[data-testid="hipaa-notice"]');
    await expect(hipaaNotice).toBeVisible();
    await expect(hipaaNotice).toContainText('HIPAA Compliance');

    // Test video container accessibility
    const videoContainer = await page.locator('[data-testid="video-container"]');
    await expect(videoContainer).toHaveAttribute('role', 'application');
    await expect(videoContainer).toHaveAttribute('aria-label');

    // Verify initial media states
    const localVideo = await page.locator('[data-testid="local-video"]');
    const remoteVideo = await page.locator('[data-testid="remote-video"]');
    await expect(localVideo).toBeVisible();
    await expect(remoteVideo).toBeVisible();

    // Test video controls
    const videoToggle = await page.locator('[data-testid="video-toggle"]');
    await videoToggle.click();
    await expect(localVideo).toHaveClass(/video-muted/);
    await videoToggle.click();
    await expect(localVideo).not.toHaveClass(/video-muted/);

    // Test audio controls
    const audioToggle = await page.locator('[data-testid="audio-toggle"]');
    await audioToggle.click();
    await expect(page.locator('[data-testid="audio-indicator"]')).toHaveClass(/muted/);
    await audioToggle.click();
    await expect(page.locator('[data-testid="audio-indicator"]')).not.toHaveClass(/muted/);

    // Verify video quality metrics
    const videoStats = await page.evaluate(() => {
      return {
        bitrate: window.vonageSession.getStats().videoBitrate,
        frameRate: window.vonageSession.getStats().frameRate,
        latency: window.vonageSession.getStats().latency,
        resolution: window.vonageSession.getStats().resolution
      };
    });

    expect(videoStats.bitrate).toBeGreaterThan(VIDEO_QUALITY_THRESHOLDS.minBitrate);
    expect(videoStats.frameRate).toBeGreaterThan(VIDEO_QUALITY_THRESHOLDS.minFrameRate);
    expect(videoStats.latency).toBeLessThan(VIDEO_QUALITY_THRESHOLDS.maxLatency);
    expect(videoStats.resolution.width).toBeGreaterThanOrEqual(VIDEO_QUALITY_THRESHOLDS.minResolution.width);
    expect(videoStats.resolution.height).toBeGreaterThanOrEqual(VIDEO_QUALITY_THRESHOLDS.minResolution.height);

    // Test interview notes in Portuguese
    const notesTextarea = await page.locator('[data-testid="interview-notes"]');
    await notesTextarea.fill('Notas do teste de entrevista médica');
    await page.locator('[data-testid="save-notes"]').click();

    // Verify notes persistence
    await waitForAsyncOperation(async () => {
      const savedNotes = await page.locator('[data-testid="saved-notes"]');
      return await savedNotes.textContent() === 'Notas do teste de entrevista médica';
    });

    // Test network resilience
    await page.route('**/*', route => {
      route.continue({
        networkConditions: {
          ...NETWORK_CONDITIONS,
          latency: 500 // Increased latency
        }
      });
    });

    // Verify automatic quality adjustment
    await waitForAsyncOperation(async () => {
      const qualityIndicator = await page.locator('[data-testid="quality-indicator"]');
      return await qualityIndicator.getAttribute('data-quality') === 'reduced';
    });

    // Complete interview
    await page.locator('[data-testid="end-interview"]').click();
    await page.locator('[data-testid="confirm-end"]').click();

    // Verify status update
    await waitForAsyncOperation(async () => {
      const status = await page.locator('[data-testid="interview-status"]');
      return await status.textContent() === EnrollmentStatus.INTERVIEW_COMPLETED;
    });

    // Verify HIPAA audit trail
    const auditLog = await page.evaluate(() => window.hipaaAuditLog);
    expect(auditLog).toContainEqual(expect.objectContaining({
      action: 'INTERVIEW_COMPLETED',
      status: 'SUCCESS'
    }));
  }, TEST_TIMEOUT);

  test('should handle language switching during interview', async () => {
    await page.goto(VIDEO_INTERVIEW_URL);

    // Test language switching
    for (const language of SUPPORTED_LANGUAGES) {
      await page.locator('[data-testid="language-selector"]').selectOption(language);
      await page.waitForLoadState('networkidle');

      // Verify UI elements in selected language
      const elements = await page.locator('[data-i18n]').all();
      for (const element of elements) {
        const translation = await element.getAttribute('data-i18n');
        expect(translation).toBeTruthy();
      }
    }
  });

  test('should maintain HIPAA compliance during connection issues', async () => {
    await page.goto(VIDEO_INTERVIEW_URL);

    // Simulate connection loss
    await page.route('**/*', route => route.abort('internetdisconnected'));

    // Verify secure reconnection attempt
    const reconnectNotice = await page.locator('[data-testid="reconnect-notice"]');
    await expect(reconnectNotice).toBeVisible();

    // Verify data protection during reconnection
    const securityIndicator = await page.locator('[data-testid="security-status"]');
    await expect(securityIndicator).toHaveAttribute('data-status', 'protected');

    // Restore connection
    await page.unroute('**/*');
    await page.route('**/*', route => route.continue());

    // Verify session recovery
    await waitForAsyncOperation(async () => {
      const sessionStatus = await page.locator('[data-testid="session-status"]');
      return await sessionStatus.getAttribute('data-status') === 'connected';
    });
  });
});