import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { memoize } from 'lodash';
import { CommonPasswordDB } from '@auth0/common-password-database';
import {
  PASSWORD_RULES,
} from '../../core/constants/validation.constants';

// Initialize common password database with memoization for performance
const commonPasswordDB = new CommonPasswordDB();
const isCommonPassword = memoize((password: string) => commonPasswordDB.isCommon(password));

/**
 * Enhanced password validator that enforces strict security requirements
 * Compliant with HIPAA, GDPR, and LGPD standards
 * @param control - AbstractControl containing the password value
 * @returns ValidationErrors object if invalid, null if valid
 */
export const passwordValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  // Safely get password value with type checking
  const password = control.value as string;
  
  // Skip validation if password is empty (for optional fields)
  if (!password) {
    return null;
  }

  const errors: ValidationErrors = {};
  let hasError = false;

  // Validate minimum length (12 characters as per constants)
  if (password.length < 12) {
    errors['minlength'] = {
      required: 12,
      actual: password.length,
      message: 'Password must be at least 12 characters long'
    };
    hasError = true;
  }

  // Count character types
  const uppercaseCount = (password.match(/[A-Z]/g) || []).length;
  const lowercaseCount = (password.match(/[a-z]/g) || []).length;
  const numberCount = (password.match(/[0-9]/g) || []).length;
  const specialCharCount = (password.match(new RegExp(`[${PASSWORD_RULES.ALLOWED_SPECIAL_CHARS}]`, 'g')) || []).length;

  // Validate character type requirements
  if (uppercaseCount < PASSWORD_RULES.MIN_UPPERCASE) {
    errors['uppercase'] = {
      required: PASSWORD_RULES.MIN_UPPERCASE,
      actual: uppercaseCount,
      message: 'Password must contain at least one uppercase letter'
    };
    hasError = true;
  }

  if (lowercaseCount < PASSWORD_RULES.MIN_LOWERCASE) {
    errors['lowercase'] = {
      required: PASSWORD_RULES.MIN_LOWERCASE,
      actual: lowercaseCount,
      message: 'Password must contain at least one lowercase letter'
    };
    hasError = true;
  }

  if (numberCount < PASSWORD_RULES.MIN_NUMBERS) {
    errors['numbers'] = {
      required: PASSWORD_RULES.MIN_NUMBERS,
      actual: numberCount,
      message: 'Password must contain at least one number'
    };
    hasError = true;
  }

  if (specialCharCount < PASSWORD_RULES.MIN_SPECIAL_CHARS) {
    errors['specialChars'] = {
      required: PASSWORD_RULES.MIN_SPECIAL_CHARS,
      actual: specialCharCount,
      message: `Password must contain at least one special character (${PASSWORD_RULES.ALLOWED_SPECIAL_CHARS})`
    };
    hasError = true;
  }

  // Check for invalid special characters
  const invalidChars = password.replace(new RegExp(`[a-zA-Z0-9${PASSWORD_RULES.ALLOWED_SPECIAL_CHARS}]`, 'g'), '');
  if (invalidChars.length > 0) {
    errors['invalidChars'] = {
      chars: invalidChars,
      message: 'Password contains invalid special characters'
    };
    hasError = true;
  }

  // Check for sequential characters
  if (/(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789)/.test(password.toLowerCase())) {
    errors['sequential'] = {
      message: 'Password cannot contain sequential characters'
    };
    hasError = true;
  }

  // Check for character repetition
  if (/(.)\1{2,}/.test(password)) {
    errors['repetition'] = {
      message: 'Password cannot contain repeated characters'
    };
    hasError = true;
  }

  // Check against common password database
  if (isCommonPassword(password)) {
    errors['common'] = {
      message: 'Password is too common and easily guessable'
    };
    hasError = true;
  }

  return hasError ? errors : null;
};

/**
 * Calculates password strength score based on multiple security factors
 * @param control - AbstractControl containing the password value
 * @returns ValidationErrors with strength score or null
 */
export const passwordStrengthValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const password = control.value as string;
  
  if (!password) {
    return null;
  }

  // Calculate entropy score (0-100)
  let entropyScore = 0;
  entropyScore += Math.min(30, password.length * 2); // Length contribution
  entropyScore += /[A-Z]/.test(password) ? 20 : 0; // Uppercase
  entropyScore += /[a-z]/.test(password) ? 20 : 0; // Lowercase
  entropyScore += /[0-9]/.test(password) ? 20 : 0; // Numbers
  entropyScore += new RegExp(`[${PASSWORD_RULES.ALLOWED_SPECIAL_CHARS}]`).test(password) ? 20 : 0; // Special chars

  // Reduce score for common patterns
  if (/(.)\1{2,}/.test(password)) entropyScore *= 0.8; // Repeated chars
  if (/(?:abc|123)/.test(password.toLowerCase())) entropyScore *= 0.8; // Sequential chars
  if (isCommonPassword(password)) entropyScore *= 0.5; // Common password

  const strengthLevel = entropyScore >= 90 ? 'very-strong' :
                       entropyScore >= 70 ? 'strong' :
                       entropyScore >= 50 ? 'moderate' :
                       entropyScore >= 30 ? 'weak' : 'very-weak';

  return {
    passwordStrength: {
      score: entropyScore,
      level: strengthLevel,
      suggestions: entropyScore < 70 ? [
        'Add more special characters',
        'Increase length',
        'Mix uppercase and lowercase',
        'Add numbers'
      ] : []
    }
  };
};

/**
 * Validates that password and confirm password fields match
 * @param control - AbstractControl (FormGroup) containing both password fields
 * @returns ValidationErrors if passwords don't match, null if they do
 */
export const passwordMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const password = control.get('password');
  const confirmPassword = control.get('confirmPassword');

  if (!password || !confirmPassword || !password.value || !confirmPassword.value) {
    return null;
  }

  return password.value === confirmPassword.value ? null : {
    passwordMismatch: {
      message: 'Passwords do not match'
    }
  };
};