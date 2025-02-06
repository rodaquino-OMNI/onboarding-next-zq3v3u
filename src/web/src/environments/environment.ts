/**
 * Development Environment Configuration
 * Version: 1.0.0
 * 
 * This file contains environment-specific settings for the development environment
 * of the AUSTA Integration Platform web application. These settings are optimized
 * for local development and testing purposes.
 */

export const environment = {
  // Environment type flag
  production: false,

  // Base API URL for development
  apiUrl: 'http://localhost:8000/api/v1',

  // API endpoint configurations
  apiEndpoints: {
    auth: {
      login: '/auth/login',
      logout: '/auth/logout',
      refresh: '/auth/refresh',
      mfa: '/auth/mfa'
    },
    users: {
      profile: '/users/profile',
      preferences: '/users/preferences',
      settings: '/users/settings'
    },
    enrollments: {
      create: '/enrollments',
      list: '/enrollments',
      detail: '/enrollments/:id',
      update: '/enrollments/:id',
      status: '/enrollments/:id/status'
    },
    documents: {
      upload: '/documents/upload',
      process: '/documents/process',
      verify: '/documents/verify/:id',
      download: '/documents/download/:id'
    },
    interviews: {
      schedule: '/interviews/schedule',
      join: '/interviews/join/:id',
      cancel: '/interviews/cancel/:id',
      reschedule: '/interviews/reschedule/:id'
    },
    healthRecords: {
      submit: '/health-records',
      update: '/health-records/:id',
      history: '/health-records/history'
    },
    webhooks: {
      register: '/webhooks/register',
      configure: '/webhooks/configure/:id',
      logs: '/webhooks/logs'
    }
  },

  // Security configuration
  securityConfig: {
    tokenExpiryTime: 3600, // 1 hour in seconds
    refreshTokenExpiry: 86400, // 24 hours in seconds
    requireMfa: false,
    corsEnabled: true,
    allowedOrigins: [
      'http://localhost:4200',
      'http://localhost:8000'
    ],
    encryptionEnabled: true,
    rateLimiting: {
      enabled: true,
      maxRequests: 1000,
      windowMs: 900000, // 15 minutes
      skipPaths: ['/health', '/metrics']
    },
    jwt: {
      algorithm: 'HS256',
      issuer: 'austa-dev',
      audience: 'austa-web-dev'
    }
  },

  // Feature flags for development
  featureFlags: {
    videoInterviews: true,
    documentOcr: true,
    multiLanguage: true,
    darkMode: true,
    biometricAuth: true,
    debugMode: true,
    mockServices: false,
    experimentalFeatures: true
  },

  // AWS service configurations
  aws: {
    region: 'us-east-1',
    textract: {
      enabled: true,
      asyncProcessing: true,
      confidenceThreshold: 85,
      retryAttempts: 3
    },
    s3: {
      bucketName: 'austa-dev-documents',
      publicUrl: 'https://austa-dev-documents.s3.amazonaws.com',
      expiryTime: 3600, // 1 hour in seconds
      maxFileSize: 10485760 // 10MB in bytes
    },
    ses: {
      enabled: true,
      fromEmail: 'noreply@austa-dev.com',
      replyToEmail: 'support@austa-dev.com'
    }
  },

  // Vonage video platform configuration
  vonage: {
    apiKey: 'development-api-key',
    enableRecording: true,
    maxDuration: 3600, // 1 hour in seconds
    videoQuality: 'HD',
    features: {
      screenSharing: true,
      chat: true,
      whiteboard: false
    },
    fallbackSettings: {
      audioOnly: true,
      lowBandwidth: true
    }
  },

  // Internationalization settings
  i18n: {
    defaultLanguage: 'pt-BR',
    supportedLanguages: ['pt-BR', 'en'],
    fallbackLanguage: 'en',
    loadPath: '/assets/i18n/{{lng}}/{{ns}}.json',
    debug: true,
    namespaces: [
      'common',
      'enrollment',
      'interview',
      'documents'
    ]
  },

  // Monitoring and debugging configuration
  monitoring: {
    enabled: true,
    logLevel: 'debug',
    metrics: {
      enabled: true,
      endpoint: '/metrics',
      interval: 30000 // 30 seconds
    },
    errorTracking: {
      enabled: true,
      sampleRate: 1.0,
      ignoreErrors: ['Network Error']
    }
  }
};