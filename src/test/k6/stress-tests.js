import { check, sleep } from 'k6'; // k6 version 0.40.0
import http from 'k6/http'; // k6 version 0.40.0
import { Trend, Rate } from 'k6/metrics'; // k6 version 0.40.0
import { STAGES, THRESHOLDS, SCENARIOS } from './config.json';

// Base configuration
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api/v1';
const API_VERSION = 'v1';

// Custom metrics initialization
const CUSTOM_METRICS = {
  enrollment_processing_time: new Trend('enrollment_processing_time'),
  document_accuracy_rate: new Rate('document_accuracy_rate'),
  video_session_quality: new Rate('video_session_quality')
};

// Test configuration
export const options = {
  stages: STAGES.stress,
  thresholds: THRESHOLDS,
  scenarios: SCENARIOS
};

// Test lifecycle functions
export function setup() {
  const testContext = {
    tokens: {},
    testData: {
      enrollments: [],
      documents: [],
      videoSessions: []
    }
  };

  try {
    // Create test users and get authentication tokens
    const adminResponse = http.post(`${BASE_URL}/auth/login`, {
      email: 'admin@test.com',
      password: 'test1234'
    });
    check(adminResponse, {
      'admin login successful': (r) => r.status === 200
    });
    testContext.tokens.admin = adminResponse.json('token');

    // Prepare test enrollment data
    testContext.testData.enrollments = Array(10).fill().map((_, index) => ({
      id: `test-enrollment-${index}`,
      personalInfo: {
        name: `Test User ${index}`,
        email: `test${index}@example.com`,
        phone: `+5511999999${index.toString().padStart(2, '0')}`
      }
    }));

    // Prepare test document data
    testContext.testData.documents = [
      { type: 'id', size: '2MB', mimeType: 'image/jpeg' },
      { type: 'address', size: '1MB', mimeType: 'application/pdf' },
      { type: 'health', size: '5MB', mimeType: 'application/pdf' }
    ];

    return testContext;
  } catch (error) {
    console.error('Setup failed:', error);
    throw error;
  }
}

export function enrollmentStressTest(testContext) {
  const payload = {
    ...testContext.testData.enrollments[Math.floor(Math.random() * testContext.testData.enrollments.length)]
  };

  const headers = {
    'Authorization': `Bearer ${testContext.tokens.admin}`,
    'Content-Type': 'application/json'
  };

  const startTime = new Date();
  
  const response = http.post(`${BASE_URL}/enrollments`, JSON.stringify(payload), {
    headers: headers
  });

  const duration = new Date() - startTime;
  CUSTOM_METRICS.enrollment_processing_time.add(duration);

  check(response, {
    'enrollment creation successful': (r) => r.status === 201,
    'response has valid enrollment ID': (r) => r.json('id') !== undefined
  });

  sleep(1);
}

export function documentProcessingStressTest(testContext) {
  const document = testContext.testData.documents[Math.floor(Math.random() * testContext.testData.documents.length)];
  
  const headers = {
    'Authorization': `Bearer ${testContext.tokens.admin}`,
    'Content-Type': 'multipart/form-data'
  };

  // Simulate document upload and processing
  const response = http.post(`${BASE_URL}/documents`, {
    file: http.file(document.type, 'test-content', document.mimeType),
    type: document.type,
    enrollmentId: testContext.testData.enrollments[0].id
  }, { headers: headers });

  check(response, {
    'document upload successful': (r) => r.status === 201,
    'OCR processing initiated': (r) => r.json('processingStatus') === 'initiated'
  });

  // Track document processing accuracy
  if (response.status === 201) {
    CUSTOM_METRICS.document_accuracy_rate.add(1);
  } else {
    CUSTOM_METRICS.document_accuracy_rate.add(0);
  }

  sleep(2);
}

export function videoSessionStressTest(testContext) {
  const headers = {
    'Authorization': `Bearer ${testContext.tokens.admin}`,
    'Content-Type': 'application/json'
  };

  // Initialize video session
  const sessionResponse = http.post(`${BASE_URL}/video-sessions`, {
    enrollmentId: testContext.testData.enrollments[0].id,
    type: 'medical-interview'
  }, { headers: headers });

  check(sessionResponse, {
    'video session creation successful': (r) => r.status === 201,
    'session token received': (r) => r.json('sessionToken') !== undefined
  });

  // Simulate video session quality metrics
  const qualityMetrics = {
    latency: Math.random() * 100,
    packetLoss: Math.random() * 0.01,
    bitrate: 2000 + Math.random() * 1000
  };

  // Track video session quality
  CUSTOM_METRICS.video_session_quality.add(
    qualityMetrics.latency < 50 && qualityMetrics.packetLoss < 0.005 ? 1 : 0
  );

  sleep(3);
}

export function teardown(testContext) {
  try {
    // Cleanup test enrollments
    testContext.testData.enrollments.forEach(enrollment => {
      http.del(`${BASE_URL}/enrollments/${enrollment.id}`, null, {
        headers: {
          'Authorization': `Bearer ${testContext.tokens.admin}`
        }
      });
    });

    // Cleanup test documents
    http.del(`${BASE_URL}/documents/test`, null, {
      headers: {
        'Authorization': `Bearer ${testContext.tokens.admin}`
      }
    });

    // Log final metrics
    console.log('Test cleanup completed successfully');
  } catch (error) {
    console.error('Teardown failed:', error);
    throw error;
  }
}

// Default export for k6 execution
export default function() {
  const testContext = setup();
  
  enrollmentStressTest(testContext);
  documentProcessingStressTest(testContext);
  videoSessionStressTest(testContext);
  
  teardown(testContext);
}