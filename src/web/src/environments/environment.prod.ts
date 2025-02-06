/**
 * Production environment configuration for AUSTA Integration Platform
 * Contains hardened security settings and production-ready configurations
 * @version 1.0.0
 */
export const environment = {
  // Production flag
  production: true,

  // API Configuration
  apiUrl: 'https://api.austa.health/v1',
  apiEndpoints: {
    auth: '/auth',
    users: '/users',
    enrollments: '/enrollments',
    documents: '/documents',
    interviews: '/interviews',
    healthRecords: '/health-records',
    webhooks: '/webhooks',
    emr: '/emr/fhir'
  },

  // Security Configuration
  securityConfig: {
    tokenExpiryTime: 1800, // 30 minutes in seconds
    requireMfa: true,
    corsEnabled: true,
    allowedOrigins: [
      'https://app.austa.health',
      'https://admin.austa.health'
    ],
    encryptionEnabled: true,
    rateLimiting: {
      enabled: true,
      maxRequests: 500,
      windowMs: 900000 // 15 minutes in milliseconds
    },
    securityHeaders: {
      strictTransportSecurity: true,
      contentSecurityPolicy: true,
      xFrameOptions: 'DENY',
      xContentTypeOptions: 'nosniff'
    }
  },

  // Feature Flags
  featureFlags: {
    videoInterviews: true,
    documentOcr: true,
    multiLanguage: true,
    darkMode: true,
    biometricAuth: true,
    offlineMode: false,
    debugMode: false
  },

  // AWS Configuration
  aws: {
    region: 'sa-east-1',
    textract: {
      enabled: true,
      asyncProcessing: true,
      maximumDocumentSize: 10485760 // 10MB in bytes
    },
    s3: {
      bucketName: 'austa-prod-documents',
      publicUrl: 'https://austa-prod-documents.s3.sa-east-1.amazonaws.com',
      encryption: 'AES256',
      versioning: true
    }
  },

  // Vonage Video Configuration
  vonage: {
    apiKey: 'VONAGE_PROD_API_KEY',
    enableRecording: true,
    maxDuration: 3600, // 1 hour in seconds
    videoQuality: 'HD',
    fallbackToAudio: true,
    autoReconnect: true
  },

  // Internationalization Configuration
  i18n: {
    defaultLanguage: 'pt-BR',
    supportedLanguages: ['pt-BR', 'en'],
    fallbackLanguage: 'en',
    loadPath: '/assets/i18n/{{lng}}/{{ns}}.json',
    cacheExpiry: 3600000 // 1 hour in milliseconds
  },

  // Monitoring Configuration
  monitoring: {
    errorTracking: true,
    performanceMonitoring: true,
    userActivityTracking: true,
    errorSamplingRate: 1.0 // 100% error sampling in production
  }
};