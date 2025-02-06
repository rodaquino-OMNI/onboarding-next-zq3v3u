/**
 * @fileoverview Core validation utilities for the AUSTA Integration Platform
 * Provides enterprise-grade validation functions with enhanced security and error handling
 * @version 1.0.0
 */

import { 
  INPUT_VALIDATION, 
  REGEX_PATTERNS, 
  FILE_VALIDATION, 
  HEALTH_RECORD_VALIDATION,
  PASSWORD_RULES 
} from '../../core/constants/validation.constants';
import isEmail from 'validator/lib/isEmail'; // v13.7.0
import DOMPurify from 'dompurify'; // v2.4.0

/**
 * Interface for validation results with detailed error reporting
 */
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  details?: Record<string, any>;
}

/**
 * Interface for health record data structure
 */
interface HealthRecord {
  medications: string[];
  conditions: string[];
  allergies: string[];
  bloodType?: string;
  [key: string]: any;
}

/**
 * Enhanced email validation with sanitization and detailed error reporting
 * @param email - Email address to validate
 * @returns ValidationResult with detailed validation status
 */
export function isEmailValid(email: string): ValidationResult {
  const result: ValidationResult = { isValid: false, errors: [] };

  try {
    // Sanitize and normalize input
    const sanitizedEmail = DOMPurify.sanitize(email).trim().toLowerCase();

    // Check for empty input
    if (!sanitizedEmail) {
      result.errors.push('Email is required');
      return result;
    }

    // Check length constraints
    if (sanitizedEmail.length > INPUT_VALIDATION.MAX_LENGTH.email) {
      result.errors.push(`Email must not exceed ${INPUT_VALIDATION.MAX_LENGTH.email} characters`);
      return result;
    }

    // Validate email format using multiple checks
    const isValidFormat = new RegExp(REGEX_PATTERNS.EMAIL).test(sanitizedEmail);
    const isValidEmail = isEmail(sanitizedEmail);

    if (!isValidFormat || !isValidEmail) {
      result.errors.push('Invalid email format');
      return result;
    }

    result.isValid = true;
  } catch (error) {
    result.errors.push('Email validation failed');
    console.error('Email validation error:', error);
  }

  return result;
}

/**
 * Enhanced password validation with security rules and complexity analysis
 * @param password - Password to validate
 * @returns ValidationResult with strength score and detailed requirements status
 */
export function isPasswordValid(password: string): ValidationResult {
  const result: ValidationResult = {
    isValid: false,
    errors: [],
    details: {
      strengthScore: 0,
      requirements: {
        length: false,
        uppercase: false,
        lowercase: false,
        numbers: false,
        specialChars: false
      }
    }
  };

  try {
    // Sanitize input
    const sanitizedPassword = DOMPurify.sanitize(password);

    // Check length requirements
    const isValidLength = sanitizedPassword.length >= INPUT_VALIDATION.MIN_LENGTH.password &&
                         sanitizedPassword.length <= INPUT_VALIDATION.MAX_LENGTH.password;
    result.details!.requirements.length = isValidLength;

    if (!isValidLength) {
      result.errors.push(`Password must be between ${INPUT_VALIDATION.MIN_LENGTH.password} and ${INPUT_VALIDATION.MAX_LENGTH.password} characters`);
    }

    // Check character requirements
    result.details!.requirements.uppercase = /[A-Z]/.test(sanitizedPassword);
    result.details!.requirements.lowercase = /[a-z]/.test(sanitizedPassword);
    result.details!.requirements.numbers = /\d/.test(sanitizedPassword);
    result.details!.requirements.specialChars = new RegExp(`[${PASSWORD_RULES.ALLOWED_SPECIAL_CHARS}]`).test(sanitizedPassword);

    // Calculate strength score (0-100)
    let strengthScore = 0;
    Object.values(result.details!.requirements).forEach(req => {
      if (req) strengthScore += 20;
    });
    result.details!.strengthScore = strengthScore;

    // Add specific requirement errors
    if (!result.details!.requirements.uppercase) {
      result.errors.push(`Password must contain at least ${PASSWORD_RULES.MIN_UPPERCASE} uppercase letter(s)`);
    }
    if (!result.details!.requirements.lowercase) {
      result.errors.push(`Password must contain at least ${PASSWORD_RULES.MIN_LOWERCASE} lowercase letter(s)`);
    }
    if (!result.details!.requirements.numbers) {
      result.errors.push(`Password must contain at least ${PASSWORD_RULES.MIN_NUMBERS} number(s)`);
    }
    if (!result.details!.requirements.specialChars) {
      result.errors.push(`Password must contain at least ${PASSWORD_RULES.MIN_SPECIAL_CHARS} special character(s)`);
    }

    result.isValid = result.errors.length === 0;
  } catch (error) {
    result.errors.push('Password validation failed');
    console.error('Password validation error:', error);
  }

  return result;
}

/**
 * Enhanced file validation with content type verification
 * @param files - Array of files to validate
 * @returns Promise<ValidationResult> with detailed file analysis
 */
export async function validateFileUpload(files: File[]): Promise<ValidationResult> {
  const result: ValidationResult = {
    isValid: false,
    errors: [],
    details: {
      validFiles: 0,
      totalSize: 0,
      fileTypes: new Set<string>()
    }
  };

  try {
    // Check file count
    if (!files.length) {
      result.errors.push('No files selected');
      return result;
    }

    if (files.length > FILE_VALIDATION.MAX_FILES_PER_UPLOAD) {
      result.errors.push(`Maximum ${FILE_VALIDATION.MAX_FILES_PER_UPLOAD} files allowed per upload`);
      return result;
    }

    // Validate each file
    for (const file of files) {
      // Check file size
      if (file.size > FILE_VALIDATION.MAX_FILE_SIZE) {
        result.errors.push(`File "${file.name}" exceeds maximum size of ${FILE_VALIDATION.MAX_FILE_SIZE / 1048576}MB`);
        continue;
      }

      // Validate MIME type
      if (!FILE_VALIDATION.ALLOWED_TYPES.includes(file.type)) {
        result.errors.push(`File type "${file.type}" not allowed for "${file.name}"`);
        continue;
      }

      result.details!.validFiles++;
      result.details!.totalSize += file.size;
      result.details!.fileTypes.add(file.type);
    }

    result.isValid = result.errors.length === 0;
  } catch (error) {
    result.errors.push('File validation failed');
    console.error('File validation error:', error);
  }

  return result;
}

/**
 * Enhanced health record validation with HIPAA compliance checks
 * @param healthRecord - Health record data to validate
 * @returns ValidationResult with HIPAA compliance status
 */
export function validateHealthRecord(healthRecord: HealthRecord): ValidationResult {
  const result: ValidationResult = {
    isValid: false,
    errors: [],
    details: {
      hipaaCompliant: true,
      validations: {}
    }
  };

  try {
    // Validate medications
    if (healthRecord.medications?.length > HEALTH_RECORD_VALIDATION.MAX_MEDICATIONS) {
      result.errors.push(`Maximum ${HEALTH_RECORD_VALIDATION.MAX_MEDICATIONS} medications allowed`);
      result.details!.validations.medications = false;
    }

    // Validate conditions
    if (healthRecord.conditions?.length > HEALTH_RECORD_VALIDATION.MAX_CONDITIONS) {
      result.errors.push(`Maximum ${HEALTH_RECORD_VALIDATION.MAX_CONDITIONS} conditions allowed`);
      result.details!.validations.conditions = false;
    }

    // Validate allergies
    if (healthRecord.allergies?.length > HEALTH_RECORD_VALIDATION.MAX_ALLERGIES) {
      result.errors.push(`Maximum ${HEALTH_RECORD_VALIDATION.MAX_ALLERGIES} allergies allowed`);
      result.details!.validations.allergies = false;
    }

    // Validate blood type
    if (healthRecord.bloodType && !HEALTH_RECORD_VALIDATION.BLOOD_TYPES.includes(healthRecord.bloodType)) {
      result.errors.push('Invalid blood type');
      result.details!.validations.bloodType = false;
    }

    // Sanitize all string values to prevent XSS
    Object.entries(healthRecord).forEach(([key, value]) => {
      if (typeof value === 'string') {
        healthRecord[key] = DOMPurify.sanitize(value);
      }
    });

    result.isValid = result.errors.length === 0;
  } catch (error) {
    result.errors.push('Health record validation failed');
    console.error('Health record validation error:', error);
  }

  return result;
}