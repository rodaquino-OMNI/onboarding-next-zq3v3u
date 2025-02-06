/**
 * @fileoverview HIPAA-compliant health record data structures with enhanced security
 * Implements comprehensive health data management with PHI protection
 * @version 1.0.0
 */

import { Enrollment } from '../interfaces/enrollment.interface';

/**
 * Comprehensive health data field types with PHI markers
 * Used for field-level encryption and access control
 */
export enum HealthDataField {
  MEDICAL_HISTORY = 'medical_history',
  CURRENT_MEDICATIONS = 'current_medications',
  ALLERGIES = 'allergies',
  CHRONIC_CONDITIONS = 'chronic_conditions',
  FAMILY_HISTORY = 'family_history',
  LIFESTYLE_FACTORS = 'lifestyle_factors',
  VITAL_SIGNS = 'vital_signs',
  IMMUNIZATIONS = 'immunizations',
  SURGICAL_HISTORY = 'surgical_history',
  MENTAL_HEALTH = 'mental_health'
}

/**
 * Encryption metadata for PHI fields
 * Tracks encryption details for compliance and auditing
 */
export interface EncryptionMetadata {
  /** Encryption algorithm used (e.g., 'AES-256-GCM') */
  algorithm: string;
  
  /** Key identifier for encryption key rotation */
  key_id: string;
  
  /** Timestamp of last encryption operation */
  encrypted_at: string;
}

/**
 * Enhanced medication data structure with temporal tracking
 */
export interface Medication {
  /** Medication name (encrypted) */
  name: string;
  
  /** Dosage information */
  dosage: string;
  
  /** Administration frequency */
  frequency: string;
  
  /** Treatment start date */
  start_date: string;
  
  /** Optional treatment end date */
  end_date?: string;
}

/**
 * Comprehensive health data structure with PHI protection
 */
export interface HealthData {
  /** Medical history entries (PHI - encrypted) */
  medical_history: string[];
  
  /** Current medications list (PHI - encrypted) */
  current_medications: Medication[];
  
  /** Known allergies */
  allergies: string[];
  
  /** Chronic medical conditions */
  chronic_conditions: string[];
  
  /** Family medical history */
  family_history: string[];
  
  /** Lifestyle and health behavior factors */
  lifestyle_factors: {
    smoking_status?: string;
    alcohol_consumption?: string;
    exercise_frequency?: string;
    diet_restrictions?: string[];
  };
  
  /** Current vital signs measurements */
  vital_signs: {
    blood_pressure?: string;
    heart_rate?: number;
    temperature?: number;
    respiratory_rate?: number;
    height?: number;
    weight?: number;
    bmi?: number;
  };
  
  /** Immunization records */
  immunizations: Array<{
    name: string;
    date: string;
    provider?: string;
    batch_number?: string;
  }>;
  
  /** Surgical history (PHI - encrypted) */
  surgical_history: Array<{
    procedure: string;
    date: string;
    hospital?: string;
    notes?: string;
  }>;
  
  /** Mental health information (PHI - encrypted) */
  mental_health: {
    conditions?: string[];
    treatments?: string[];
    medications?: Medication[];
  };
  
  /** Encryption metadata for PHI fields */
  encryption_metadata: EncryptionMetadata;
}

/**
 * Health record access and modification audit trail
 */
export interface HealthRecordAudit {
  /** Action performed (create/read/update/delete) */
  action: string;
  
  /** User who performed the action */
  user_id: string;
  
  /** Timestamp of the action */
  timestamp: string;
  
  /** Fields accessed or modified */
  fields_accessed: string[];
}

/**
 * Complete health record structure with security features
 * Implements HIPAA compliance requirements
 */
export interface HealthRecord {
  /** Unique identifier */
  id: string;
  
  /** Associated enrollment ID */
  enrollment_id: string;
  
  /** Comprehensive health data */
  health_data: HealthData;
  
  /** Verification status */
  verified: boolean;
  
  /** Access and modification audit trail */
  audit_trail: HealthRecordAudit[];
  
  /** Data retention period in days */
  retention_period: number;
  
  /** Initial submission timestamp */
  submitted_at: string;
  
  /** Record creation timestamp */
  created_at: string;
  
  /** Last modification timestamp */
  updated_at: string;
}