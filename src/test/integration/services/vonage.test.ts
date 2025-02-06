import { VonageService } from '../../../backend/app/Services/Video/VonageService';
import { 
  MockVonageSession, 
  MOCK_SESSION_ID, 
  MOCK_TOKEN, 
  MOCK_NETWORK_CONDITIONS,
  createMockSession,
  generateMockToken,
  mockEndSession,
  mockSessionStatus
} from '../../mocks/vonage-video.mock';
import { UserRole } from '../../../web/src/app/core/interfaces/user.interface';
import { InterviewStatus } from '../../../web/src/app/core/interfaces/interview.interface';
import supertest from 'supertest';
import nock from 'nock';
import jest from 'jest';

describe('VonageService Integration Tests', () => {
  let vonageService: VonageService;
  let mockSession: MockVonageSession;

  beforeAll(async () => {
    // Initialize service with test configuration
    vonageService = new VonageService();
    
    // Configure test environment
    process.env.VONAGE_API_KEY = 'test-api-key';
    process.env.VONAGE_API_SECRET = 'test-api-secret';
    process.env.VONAGE_DEFAULT_REGION = 'sa-east-1';

    // Setup network mocking
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });

  afterEach(async () => {
    // Reset mocks and clear test data
    jest.clearAllMocks();
    nock.cleanAll();
    
    if (mockSession) {
      mockSession.disconnect();
    }
  });

  describe('Session Creation', () => {
    it('should create a new video session with HIPAA compliance', async () => {
      const options = {
        mediaMode: 'routed',
        location: 'sa-east-1'
      };

      const session = await vonageService.createSession(options);

      expect(session).toBeDefined();
      expect(session.sessionId).toBeTruthy();
      expect(session.region).toBe('sa-east-1');
      expect(session.configuration.security.mediaEncryption).toBe(true);
      expect(session.configuration.security.enforceE2E).toBe(true);
    });

    it('should enforce regional optimization', async () => {
      const session = await vonageService.createSession({
        location: 'invalid-region'
      });

      expect(session.region).toBe('sa-east-1'); // Should use default region
    });

    it('should handle session creation failure gracefully', async () => {
      nock('https://api.vonage.com')
        .post('/video/session')
        .replyWithError('Network error');

      await expect(vonageService.createSession({}))
        .rejects
        .toThrow('Failed to create video session');
    });
  });

  describe('Token Generation', () => {
    let sessionId: string;

    beforeEach(async () => {
      const session = await vonageService.createSession({});
      sessionId = session.sessionId;
    });

    it('should generate valid tokens for different roles', async () => {
      const roles = ['interviewer', 'interviewee'];

      for (const role of roles) {
        const tokenData = await vonageService.generateToken(sessionId, role);

        expect(tokenData.token).toBeTruthy();
        expect(tokenData.role).toBe(role);
        expect(tokenData.expiresAt).toBeGreaterThan(Date.now());
        expect(tokenData.permissions).toBeDefined();
      }
    });

    it('should include appropriate permissions for each role', async () => {
      const interviewerToken = await vonageService.generateToken(sessionId, 'interviewer');
      expect(interviewerToken.permissions).toContain('moderate');
      expect(interviewerToken.permissions).toContain('record');

      const intervieweeToken = await vonageService.generateToken(sessionId, 'interviewee');
      expect(intervieweeToken.permissions).not.toContain('moderate');
      expect(intervieweeToken.permissions).toContain('publish');
    });

    it('should reject invalid roles', async () => {
      await expect(vonageService.generateToken(sessionId, 'invalid-role'))
        .rejects
        .toThrow('Invalid token role specified');
    });
  });

  describe('Session Management', () => {
    let activeSession: string;

    beforeEach(async () => {
      const session = await vonageService.createSession({});
      activeSession = session.sessionId;
    });

    it('should end session and perform cleanup', async () => {
      const result = await vonageService.endSession(activeSession);

      expect(result.status).toBe('terminated');
      expect(result.terminatedAt).toBeDefined();
      expect(result.cleanup.status).toBe('completed');
    });

    it('should retrieve detailed session status', async () => {
      const status = await vonageService.getSessionStatus(activeSession);

      expect(status.sessionId).toBe(activeSession);
      expect(status.healthStatus).toBeDefined();
      expect(status.metrics).toHaveProperty('bandwidth');
      expect(status.metrics).toHaveProperty('quality');
    });
  });

  describe('Network Resilience', () => {
    let session: MockVonageSession;

    beforeEach(() => {
      session = new MockVonageSession(MOCK_SESSION_ID, {
        networkQuality: MOCK_NETWORK_CONDITIONS.good
      });
    });

    it('should handle poor network conditions', async () => {
      session.simulateNetworkQuality(MOCK_NETWORK_CONDITIONS.poor);
      
      const status = await vonageService.getSessionStatus(MOCK_SESSION_ID);
      
      expect(status.healthStatus.status).toBe('degraded');
      expect(status.metrics.quality).toBeLessThan(50);
      expect(status.metrics.bandwidth.current).toBeLessThan(status.metrics.bandwidth.optimal);
    });

    it('should recover from temporary network issues', async () => {
      // Simulate network degradation
      session.simulateNetworkQuality(MOCK_NETWORK_CONDITIONS.poor);
      
      // Simulate recovery
      session.simulateNetworkQuality(MOCK_NETWORK_CONDITIONS.good);
      
      const status = await vonageService.getSessionStatus(MOCK_SESSION_ID);
      
      expect(status.healthStatus.status).toBe('healthy');
      expect(status.metrics.quality).toBeGreaterThan(70);
    });

    it('should collect diagnostic data during network issues', async () => {
      session.simulateNetworkQuality(MOCK_NETWORK_CONDITIONS.critical);
      
      const status = await vonageService.getSessionStatus(MOCK_SESSION_ID);
      
      expect(status.diagnosticData).toBeDefined();
      expect(status.diagnosticData.warnings).toHaveLength(1);
      expect(status.diagnosticData.errors).toHaveLength(1);
      expect(status.diagnosticData.packetLoss).toBeGreaterThan(0);
    });
  });

  describe('Regional Distribution', () => {
    it('should create sessions in specified regions', async () => {
      const regions = ['sa-east-1', 'us-east-1', 'eu-west-1'];

      for (const region of regions) {
        const session = await vonageService.createSession({
          location: region
        });

        expect(session.region).toBe(region);
      }
    });

    it('should handle regional failover', async () => {
      // Mock primary region failure
      nock('https://api.vonage.com')
        .post('/video/session')
        .query({ region: 'sa-east-1' })
        .replyWithError('Region unavailable');

      const session = await vonageService.createSession({
        location: 'sa-east-1'
      });

      // Should failover to backup region
      expect(session.region).toBe('us-east-1');
    });
  });
});