/**
 * Staging Environment Configuration
 * Version: 1.0.0
 * 
 * This file contains environment-specific settings for the staging/pre-production environment.
 * It provides configuration for API endpoints, security settings, feature flags, and external
 * service integrations required for pre-release testing and validation.
 */

export const environment = {
  // Environment type flag
  production: false,

  // Base API URL for staging environment
  apiUrl: 'https://staging-api.austa.health/api/v1',

  // API endpoint configurations
  apiEndpoints: {
    auth: '/auth',
    users: '/users',
    enrollments: '/enrollments',
    documents: '/documents',
    interviews: '/interviews',
    healthRecords: '/health-records',
    webhooks: '/webhooks',
    monitoring: '/monitoring'
  },

  // Security configurations
  securityConfig: {
    tokenExpiryTime: 3600, // JWT expiry in seconds
    requireMfa: true,
    corsEnabled: true,
    allowedOrigins: [
      'https://staging.austa.health',
      'https://admin-staging.austa.health'
    ],
    encryptionEnabled: true,
    rateLimiting: {
      enabled: true,
      maxRequests: 200,
      windowMs: 900000, // 15 minutes
      errorThreshold: 50
    },
    mfa: {
      enabled: true,
      provider: 'google-authenticator',
      backupCodes: 5
    },
    sessionConfig: {
      maxDuration: 7200, // 2 hours
      inactivityTimeout: 1800, // 30 minutes
      renewalWindow: 300 // 5 minutes
    }
  },

  // Feature flags for staging environment
  featureFlags: {
    videoInterviews: true,
    documentOcr: true,
    multiLanguage: true,
    darkMode: true,
    biometricAuth: true,
    betaFeatures: true,
    debugMode: true,
    performanceMonitoring: true
  },

  // AWS service configurations
  aws: {
    region: 'us-east-1',
    textract: {
      enabled: true,
      asyncProcessing: true,
      maxRetries: 3,
      timeout: 300 // seconds
    },
    s3: {
      bucketName: 'austa-staging-documents',
      publicUrl: 'https://austa-staging-documents.s3.amazonaws.com',
      encryption: 'AES256',
      versioning: true
    },
    cloudwatch: {
      enabled: true,
      logGroup: 'austa-staging-logs',
      retentionDays: 30
    }
  },

  // Vonage video platform configuration
  vonage: {
    apiKey: 'staging-api-key',
    enableRecording: true,
    maxDuration: 3600, // 1 hour
    videoQuality: 'HD',
    features: {
      screenSharing: true,
      chat: true,
      recording: true
    },
    fallbackSettings: {
      audioOnly: true,
      lowBandwidth: true
    }
  },

  // Internationalization settings
  i18n: {
    defaultLanguage: 'pt-BR',
    supportedLanguages: ['pt-BR', 'en', 'es'],
    fallbackLanguage: 'en',
    loadPath: '/assets/i18n/{{lng}}/{{ns}}.json',
    debug: true
  },

  // Monitoring and logging configuration
  monitoring: {
    enabled: true,
    sentry: {
      dsn: 'https://staging-sentry-key@sentry.io/123',
      environment: 'staging',
      tracesSampleRate: 1.0
    },
    logging: {
      level: 'debug',
      console: true,
      remote: true
    },
    performance: {
      enabled: true,
      apiResponseTime: true,
      resourceUsage: true,
      errorTracking: true
    }
  }
};