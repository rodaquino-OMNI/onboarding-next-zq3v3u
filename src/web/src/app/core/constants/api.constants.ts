/**
 * API Constants
 * Version: 1.0.0
 * 
 * Defines comprehensive API-related constants for the AUSTA Integration Platform
 * including endpoints, headers, status codes, and error codes.
 * 
 * @packageDocumentation
 */

import { apiUrl, apiEndpoints } from '../../../environments/environment';

/**
 * Current API version identifier
 * @constant
 */
export const API_VERSION = 'v1';

/**
 * API endpoint constants with versioning
 * @constant
 */
export const API_ENDPOINTS = {
  AUTH: `${apiUrl}/auth`,
  USERS: `${apiUrl}/users`,
  ENROLLMENTS: `${apiUrl}/enrollments`,
  DOCUMENTS: `${apiUrl}/documents`,
  HEALTH_RECORDS: `${apiUrl}/health-records`,
  INTERVIEWS: `${apiUrl}/interviews`,
  WEBHOOKS: `${apiUrl}/webhooks`,
  HEALTH_CHECK: `${apiUrl}/health`
};

/**
 * HTTP status code constants
 * @constant
 */
export const HTTP_STATUS = {
  // Success codes
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,

  // Client error codes
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,

  // Server error codes
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
};

/**
 * Enhanced HTTP header constants including security and rate limiting
 * @constant
 */
export const API_HEADERS = {
  // Standard headers
  CONTENT_TYPE: 'Content-Type',
  ACCEPT: 'Accept',
  AUTHORIZATION: 'Authorization',
  
  // Localization
  LANGUAGE: 'Accept-Language',
  
  // Security headers
  X_CSRF_TOKEN: 'X-CSRF-Token',
  X_REQUEST_ID: 'X-Request-ID',
  X_API_VERSION: 'X-API-Version',
  X_CLIENT_VERSION: 'X-Client-Version',
  
  // Rate limiting headers
  X_RATE_LIMIT: 'X-RateLimit-Limit',
  X_RATE_LIMIT_REMAINING: 'X-RateLimit-Remaining',
  X_RATE_LIMIT_RESET: 'X-RateLimit-Reset',
  
  // Custom application headers
  X_TENANT_ID: 'X-Tenant-ID',
  X_CORRELATION_ID: 'X-Correlation-ID',
  X_DEVICE_ID: 'X-Device-ID'
};

/**
 * Extended error code constants including business-specific errors
 * @constant
 */
export const ERROR_CODES = {
  // Authentication & Authorization
  VALIDATION_ERROR: 'ERR_VALIDATION',
  AUTHENTICATION_ERROR: 'ERR_AUTH',
  AUTHORIZATION_ERROR: 'ERR_FORBIDDEN',
  TOKEN_EXPIRED: 'ERR_TOKEN_EXPIRED',
  INVALID_TOKEN: 'ERR_INVALID_TOKEN',
  MFA_REQUIRED: 'ERR_MFA_REQUIRED',
  
  // Resource errors
  RESOURCE_NOT_FOUND: 'ERR_NOT_FOUND',
  RESOURCE_CONFLICT: 'ERR_CONFLICT',
  RESOURCE_LOCKED: 'ERR_LOCKED',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'ERR_RATE_LIMIT',
  
  // Document processing
  INVALID_DOCUMENT: 'ERR_DOC_INVALID',
  DOCUMENT_PROCESSING_FAILED: 'ERR_DOC_PROCESSING',
  DOCUMENT_UPLOAD_FAILED: 'ERR_DOC_UPLOAD',
  DOCUMENT_TOO_LARGE: 'ERR_DOC_SIZE',
  
  // Interview related
  INTERVIEW_SCHEDULING_ERROR: 'ERR_INTERVIEW_SCHEDULE',
  INTERVIEW_CONNECTION_ERROR: 'ERR_INTERVIEW_CONNECTION',
  INTERVIEW_RECORDING_ERROR: 'ERR_INTERVIEW_RECORDING',
  
  // Health record errors
  HEALTH_RECORD_INVALID: 'ERR_HEALTH_RECORD',
  HEALTH_RECORD_UPDATE_FAILED: 'ERR_HEALTH_UPDATE',
  
  // Server errors
  SERVER_ERROR: 'ERR_SERVER',
  SERVICE_UNAVAILABLE: 'ERR_SERVICE_UNAVAILABLE',
  GATEWAY_ERROR: 'ERR_GATEWAY',
  
  // Integration errors
  WEBHOOK_ERROR: 'ERR_WEBHOOK',
  EMR_INTEGRATION_ERROR: 'ERR_EMR_INTEGRATION',
  THIRD_PARTY_ERROR: 'ERR_THIRD_PARTY'
};

/**
 * Content type constants
 * @constant
 */
export const CONTENT_TYPES = {
  JSON: 'application/json',
  FORM_DATA: 'multipart/form-data',
  FORM_URLENCODED: 'application/x-www-form-urlencoded',
  OCTET_STREAM: 'application/octet-stream',
  PDF: 'application/pdf',
  JPEG: 'image/jpeg',
  PNG: 'image/png'
};

/**
 * API timeout configurations in milliseconds
 * @constant
 */
export const API_TIMEOUTS = {
  DEFAULT: 30000,
  UPLOAD: 60000,
  DOWNLOAD: 60000,
  LONG_RUNNING: 120000
};