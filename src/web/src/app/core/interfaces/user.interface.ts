/**
 * @fileoverview TypeScript interfaces defining user-related types for the healthcare enrollment platform
 * @version 1.0.0
 */

/**
 * Available user roles for role-based access control
 */
export enum UserRole {
  Individual = 'individual',
  Broker = 'broker',
  Interviewer = 'interviewer',
  Admin = 'admin'
}

/**
 * Supported languages for multi-language support
 */
export enum Language {
  English = 'en',
  Portuguese = 'pt-BR'
}

/**
 * Available theme options for accessibility support
 */
export enum Theme {
  Light = 'light',
  Dark = 'dark',
  System = 'system'
}

/**
 * User notification preferences structure
 */
export interface NotificationPreferences {
  email: boolean;
  sms: boolean;
  inApp: boolean;
}

/**
 * Comprehensive user preference settings
 */
export interface UserPreferences {
  language: Language;
  theme: Theme;
  notifications: NotificationPreferences;
  accessibility: {
    fontSize: number;
    highContrast: boolean;
  };
}

/**
 * Comprehensive user data structure
 * Implements HIPAA and GDPR compliance requirements for user data handling
 */
export interface User {
  /** Unique identifier for the user */
  id: string;
  
  /** Full name of the user */
  name: string;
  
  /** Email address used for authentication and communication */
  email: string;
  
  /** User's assigned role for access control */
  role: UserRole;
  
  /** User's customized preferences */
  preferences: UserPreferences;
  
  /** Timestamp of email verification, null if unverified */
  emailVerifiedAt: Date | null;
  
  /** Whether multi-factor authentication is enabled */
  mfaEnabled: boolean;
  
  /** Timestamp of last successful login */
  lastLoginAt: Date | null;
  
  /** Account creation timestamp */
  createdAt: Date;
  
  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Authenticated user state with JWT tokens
 * Implements secure token handling for authentication
 */
export interface AuthenticatedUser {
  /** User data */
  user: User;
  
  /** JWT access token */
  token: string;
  
  /** Access token expiration timestamp */
  tokenExpiry: Date;
  
  /** Refresh token for obtaining new access tokens */
  refreshToken: string;
}