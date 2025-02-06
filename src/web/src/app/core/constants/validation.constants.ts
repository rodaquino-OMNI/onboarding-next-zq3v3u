/**
 * @fileoverview Centralized validation constants and rules for the AUSTA Integration Platform
 * Implements strict validation rules for data quality, form validation, and security compliance
 * @version 1.0.0
 */

/**
 * Maximum and minimum length constraints for input fields
 */
export const INPUT_VALIDATION = {
  MAX_LENGTH: {
    name: 50,
    email: 100,
    password: 72, // bcrypt max length
    address: 200,
    description: 1000,
    notes: 2000
  },
  MIN_LENGTH: {
    password: 12, // security best practice
    name: 2
  }
} as const;

/**
 * Password complexity requirements for secure authentication
 * Follows OWASP password guidelines
 */
export const PASSWORD_RULES = {
  MIN_UPPERCASE: 1,
  MIN_LOWERCASE: 1,
  MIN_NUMBERS: 1,
  MIN_SPECIAL_CHARS: 1,
  ALLOWED_SPECIAL_CHARS: '!@#$%^&*()_+-=[]{}|;:,.<>?'
} as const;

/**
 * File upload validation constraints
 * Size limit: 10MB (10485760 bytes)
 */
export const FILE_VALIDATION = {
  MAX_FILE_SIZE: 10485760,
  ALLOWED_TYPES: [
    'image/jpeg',
    'image/png',
    'application/pdf'
  ],
  MAX_FILES_PER_UPLOAD: 5
} as const;

/**
 * Regular expression patterns for data validation
 * Includes patterns for common fields and Brazil-specific formats
 */
export const REGEX_PATTERNS = {
  // RFC 5322 compliant email pattern
  EMAIL: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
  
  // Brazilian CPF format (XXX.XXX.XXX-XX)
  CPF: '^\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2}$',
  
  // International phone number format
  PHONE: '^\\+?\\d{1,4}?[-.\\s]?\\(?\\d{1,3}?\\)?[-.\\s]?\\d{1,4}[-.\\s]?\\d{1,4}[-.\\s]?\\d{1,9}$',
  
  // ISO 8601 date format (YYYY-MM-DD)
  DATE: '^\\d{4}-\\d{2}-\\d{2}$',
  
  // Name validation with support for accented characters
  NAME: "^[a-zA-ZÀ-ÿ\\s'-]+$"
} as const;

/**
 * Healthcare-specific validation rules and constraints
 * Defines limits and valid values for health record data
 */
export const HEALTH_RECORD_VALIDATION = {
  MAX_MEDICATIONS: 20,
  MAX_CONDITIONS: 30,
  MAX_ALLERGIES: 15,
  BLOOD_TYPES: [
    'A+',
    'A-',
    'B+',
    'B-',
    'AB+',
    'AB-',
    'O+',
    'O-'
  ]
} as const;

// Type assertions to ensure constants are readonly
Object.freeze(INPUT_VALIDATION);
Object.freeze(PASSWORD_RULES);
Object.freeze(FILE_VALIDATION);
Object.freeze(REGEX_PATTERNS);
Object.freeze(HEALTH_RECORD_VALIDATION);