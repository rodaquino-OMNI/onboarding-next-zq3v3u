/**
 * @fileoverview TypeScript interface definitions for video interview-related data structures
 * @version 1.0.0
 * Implements video-based medical interview requirements with Vonage integration support
 */

import { UserRole } from '../interfaces/user.interface';

/**
 * Possible interview status values
 */
export enum InterviewStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  MISSED = 'missed'
}

/**
 * Status labels for UI display
 */
export const INTERVIEW_STATUS_LABELS = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  missed: 'Missed'
};

/**
 * Interview participant data structure with enhanced device and accessibility information
 */
export interface InterviewParticipant {
  /** Unique identifier for the participant */
  id: string;

  /** Participant's role (interviewer or individual) */
  role: UserRole;

  /** Participant's full name */
  name: string;

  /** Connection status */
  connected: boolean;

  /** Audio stream status */
  audioEnabled: boolean;

  /** Video stream status */
  videoEnabled: boolean;

  /** Device and browser information */
  deviceInfo: {
    type: string;
    browser: string;
    os: string;
    version: string;
  };

  /** Network connection status */
  networkStatus: {
    state: 'stable' | 'unstable';
    lastChecked: Date;
  };

  /** Accessibility and language preferences */
  preferences: {
    language: string;
    captionsEnabled: boolean;
    assistiveTechnology: boolean;
  };
}

/**
 * Video interview session data with comprehensive quality and diagnostic information
 */
export interface InterviewSession {
  /** Unique session identifier */
  id: string;

  /** Vonage session ID */
  sessionId: string;

  /** Vonage authentication token */
  token: string;

  /** List of session participants */
  participants: InterviewParticipant[];

  /** Session start timestamp */
  startedAt: Date;

  /** Session end timestamp */
  endedAt: Date;

  /** Connection quality metrics */
  connectionQuality: {
    status: 'good' | 'fair' | 'poor';
    metrics: {
      bitrate: number;
      packetLoss: number;
      latency: number;
    };
  };

  /** Recording configuration */
  recording: {
    enabled: boolean;
    format: string;
    retention: number;
    consent: boolean;
  };

  /** Session diagnostics */
  diagnostics: {
    errors: Array<{
      code: string;
      message: string;
      timestamp: Date;
    }>;
    warnings: Array<{
      type: string;
      detail: string;
      timestamp: Date;
    }>;
  };
}

/**
 * Main interview interface defining complete interview data structure
 * Implements enhanced tracking and compliance features
 */
export interface Interview {
  /** Unique interview identifier */
  id: string;

  /** Associated enrollment identifier */
  enrollment_id: string;

  /** Assigned interviewer identifier */
  interviewer_id: string;

  /** Current interview status */
  status: InterviewStatus;

  /** Scheduled interview time */
  scheduled_at: Date;

  /** Interview completion time */
  completed_at: Date;

  /** Medical interview notes */
  notes: string;

  /** Video session information */
  session: InterviewSession;

  /** Maximum allowed duration in minutes */
  maxDuration: number;

  /** Recording storage URL */
  recordingUrl: string;

  /** Technical issues or setup notes */
  technicalNotes: string;

  /** Creation timestamp */
  created_at: Date;

  /** Last update timestamp */
  updated_at: Date;

  /** Audit trail for compliance */
  auditTrail: Array<{
    action: string;
    performer: string;
    timestamp: Date;
    details: string;
  }>;
}

/**
 * Interview creation request structure
 */
export interface CreateInterviewRequest {
  /** Associated enrollment identifier */
  enrollment_id: string;

  /** Assigned interviewer identifier */
  interviewer_id: string;

  /** Scheduled interview time */
  scheduled_at: Date;
}

/**
 * Interview update request structure
 */
export interface UpdateInterviewRequest {
  /** Updated interview status */
  status: InterviewStatus;

  /** Updated medical notes */
  notes: string;

  /** Interview completion time */
  completed_at: Date;
}