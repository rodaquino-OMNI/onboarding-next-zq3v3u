/**
 * @fileoverview Mock implementation of Vonage Video API for testing video interview functionality
 * @version 1.0.0
 */

import { Interview, InterviewStatus } from '../../web/src/app/core/interfaces/interview.interface';
import { UserRole } from '../../web/src/app/core/interfaces/user.interface';
import jest from 'jest'; // ^29.0.0

// Mock constants
export const MOCK_SESSION_ID = 'mock-session-123';
export const MOCK_TOKEN = 'mock-token-456';
export const MOCK_NETWORK_CONDITIONS = {
  perfect: 100,
  good: 75,
  fair: 50,
  poor: 25,
  critical: 10
};

/**
 * Enhanced mock implementation of Vonage Session with network simulation
 */
export class MockVonageSession {
  private sessionId: string;
  private isConnected: boolean = false;
  private participants: Array<{ id: string; role: UserRole }> = [];
  private networkQuality: number;
  private isRecording: boolean;
  private diagnosticData: {
    bitrate: number;
    packetLoss: number;
    latency: number;
    warnings: any[];
    errors: any[];
  };

  constructor(sessionId: string, options?: { networkQuality?: number; recordingEnabled?: boolean }) {
    this.sessionId = sessionId;
    this.networkQuality = options?.networkQuality || MOCK_NETWORK_CONDITIONS.good;
    this.isRecording = options?.recordingEnabled || false;
    this.diagnosticData = {
      bitrate: 2000,
      packetLoss: 0,
      latency: 50,
      warnings: [],
      errors: []
    };
  }

  async connect(token: string): Promise<void> {
    if (token !== MOCK_TOKEN) {
      throw new Error('Invalid token provided');
    }
    this.isConnected = true;
    this.startNetworkSimulation();
  }

  disconnect(): void {
    this.isConnected = false;
    this.participants = [];
    if (this.isRecording) {
      this.isRecording = false;
    }
    this.generateFinalDiagnostics();
  }

  simulateNetworkQuality(quality: number): void {
    if (quality < 0 || quality > 100) {
      throw new Error('Network quality must be between 0 and 100');
    }
    this.networkQuality = quality;
    this.updateDiagnostics();
  }

  private startNetworkSimulation(): void {
    this.updateDiagnostics();
  }

  private updateDiagnostics(): void {
    const qualityFactor = this.networkQuality / 100;
    this.diagnosticData = {
      bitrate: 2000 * qualityFactor,
      packetLoss: 10 * (1 - qualityFactor),
      latency: 50 + (200 * (1 - qualityFactor)),
      warnings: this.networkQuality < 50 ? [{ type: 'quality', message: 'Poor network conditions' }] : [],
      errors: this.networkQuality < 25 ? [{ type: 'connection', message: 'Critical network issues' }] : []
    };
  }

  private generateFinalDiagnostics(): void {
    // Add session termination data to diagnostics
    this.diagnosticData.warnings.push({
      type: 'session',
      message: 'Session terminated',
      timestamp: new Date()
    });
  }
}

/**
 * Creates a mock Vonage video session with configurable network conditions
 */
export const createMockSession = jest.fn(async (options?: {
  networkQuality?: number;
  maxParticipants?: number;
  recordingEnabled?: boolean;
}): Promise<string> => {
  if (options?.maxParticipants && options.maxParticipants < 2) {
    throw new Error('Session must allow at least 2 participants');
  }
  return MOCK_SESSION_ID;
});

/**
 * Generates a mock token for video session access with role validation
 */
export const generateMockToken = jest.fn((sessionId: string, role: UserRole): string => {
  if (sessionId !== MOCK_SESSION_ID) {
    throw new Error('Invalid session ID');
  }
  if (![UserRole.Individual, UserRole.Interviewer].includes(role)) {
    throw new Error('Invalid role for video session');
  }
  return MOCK_TOKEN;
});

/**
 * Simulates ending a video session with cleanup
 */
export const mockEndSession = jest.fn(async (sessionId: string): Promise<boolean> => {
  if (sessionId !== MOCK_SESSION_ID) {
    throw new Error('Invalid session ID');
  }
  return true;
});

/**
 * Returns comprehensive mock session status data
 */
export const mockSessionStatus = jest.fn((sessionId: string): {
  connected: boolean;
  participants: number;
  quality: number;
  recording: boolean;
  diagnostics: any;
} => {
  if (sessionId !== MOCK_SESSION_ID) {
    throw new Error('Invalid session ID');
  }

  return {
    connected: true,
    participants: 2,
    quality: MOCK_NETWORK_CONDITIONS.good,
    recording: false,
    diagnostics: {
      bitrate: 2000,
      packetLoss: 0,
      latency: 50,
      warnings: [],
      errors: []
    }
  };
});