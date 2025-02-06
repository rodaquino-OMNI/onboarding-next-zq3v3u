/**
 * @fileoverview Enrollment data structures and status management interfaces
 * Implements HIPAA-compliant enrollment processing with type safety
 * @version 1.0.0
 */

import { Document } from '../interfaces/document.interface';

/**
 * Enrollment status enum defining all possible states
 * Ensures type safety for status transitions
 */
export enum EnrollmentStatus {
  DRAFT = 'draft',
  DOCUMENTS_PENDING = 'documents_pending',
  DOCUMENTS_SUBMITTED = 'documents_submitted',
  HEALTH_DECLARATION_PENDING = 'health_declaration_pending',
  INTERVIEW_SCHEDULED = 'interview_scheduled',
  INTERVIEW_COMPLETED = 'interview_completed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

/**
 * Personal information structure with HIPAA compliance
 */
export interface PersonalInfo {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  ssn: string; // Stored encrypted
  maritalStatus: string;
  nationality: string;
  preferredLanguage: string;
}

/**
 * Address information with validation support
 */
export interface AddressInfo {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  residenceSince: string;
}

/**
 * Contact information with verification status
 */
export interface ContactInfo {
  email: string;
  emailVerified: boolean;
  phone: string;
  phoneVerified: boolean;
  alternativePhone?: string;
  preferredContactMethod: 'email' | 'phone';
}

/**
 * Enrollment preferences and settings
 */
export interface EnrollmentPreferences {
  communicationLanguage: string;
  notificationPreferences: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
  accessibilityRequirements?: string[];
  timeZone: string;
}

/**
 * Complete enrollment metadata structure
 */
export interface EnrollmentMetadata {
  personal_info: PersonalInfo;
  address_info: AddressInfo;
  contact_info: ContactInfo;
  preferences: EnrollmentPreferences;
}

/**
 * Interview scheduling and management
 */
export interface EnrollmentInterview {
  id: string;
  enrollment_id: string;
  interviewer_id: string;
  scheduled_at: string;
  completed_at?: string;
  video_url?: string;
  notes?: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
}

/**
 * Health record with verification tracking
 */
export interface EnrollmentHealthRecord {
  id: string;
  enrollment_id: string;
  health_data: {
    conditions: string[];
    medications: Array<{
      name: string;
      dosage: string;
      frequency: string;
    }>;
    allergies: string[];
    surgeries: string[];
    familyHistory: string[];
  };
  verified: boolean;
  submitted_at: string;
  verified_at?: string;
  verified_by?: string;
}

/**
 * Complete enrollment entity with all related data
 */
export interface Enrollment {
  id: string;
  user_id: string;
  status: EnrollmentStatus;
  metadata: EnrollmentMetadata;
  documents: Document[];
  healthRecords: EnrollmentHealthRecord[];
  interviews: EnrollmentInterview[];
  progress: number;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Type-safe enrollment creation request
 */
export interface CreateEnrollmentRequest {
  user_id: string;
  metadata: EnrollmentMetadata;
}

/**
 * Type-safe enrollment update request with partial updates
 */
export interface UpdateEnrollmentRequest {
  status?: EnrollmentStatus;
  metadata?: Partial<EnrollmentMetadata>;
}

/**
 * Status labels for UI display
 */
export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  [EnrollmentStatus.DRAFT]: 'Draft',
  [EnrollmentStatus.DOCUMENTS_PENDING]: 'Documents Pending',
  [EnrollmentStatus.DOCUMENTS_SUBMITTED]: 'Documents Submitted',
  [EnrollmentStatus.HEALTH_DECLARATION_PENDING]: 'Health Declaration Pending',
  [EnrollmentStatus.INTERVIEW_SCHEDULED]: 'Interview Scheduled',
  [EnrollmentStatus.INTERVIEW_COMPLETED]: 'Interview Completed',
  [EnrollmentStatus.COMPLETED]: 'Completed',
  [EnrollmentStatus.CANCELLED]: 'Cancelled'
};

/**
 * Valid status transitions for enrollment workflow
 */
export const ENROLLMENT_STATUS_TRANSITIONS: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  [EnrollmentStatus.DRAFT]: [EnrollmentStatus.DOCUMENTS_PENDING],
  [EnrollmentStatus.DOCUMENTS_PENDING]: [EnrollmentStatus.DOCUMENTS_SUBMITTED, EnrollmentStatus.CANCELLED],
  [EnrollmentStatus.DOCUMENTS_SUBMITTED]: [EnrollmentStatus.HEALTH_DECLARATION_PENDING, EnrollmentStatus.CANCELLED],
  [EnrollmentStatus.HEALTH_DECLARATION_PENDING]: [EnrollmentStatus.INTERVIEW_SCHEDULED, EnrollmentStatus.CANCELLED],
  [EnrollmentStatus.INTERVIEW_SCHEDULED]: [EnrollmentStatus.INTERVIEW_COMPLETED, EnrollmentStatus.CANCELLED],
  [EnrollmentStatus.INTERVIEW_COMPLETED]: [EnrollmentStatus.COMPLETED, EnrollmentStatus.CANCELLED],
  [EnrollmentStatus.COMPLETED]: [],
  [EnrollmentStatus.CANCELLED]: []
};