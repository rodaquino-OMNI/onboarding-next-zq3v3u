import { check, sleep } from 'k6';
import http from 'k6/http';
import { STAGES, THRESHOLDS, SCENARIOS } from './config.json';

// Base URL for API endpoints
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api/v1';

// Test configuration
export const options = {
  stages: STAGES.spike,
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
    enrollment_success: ['rate>0.95'],
    document_processing: ['p(90)<5000'],
    circuit_breaker_triggers: ['count<10'],
    system_recovery_time: ['p(95)<30000']
  }
};

// Custom metrics for spike testing
const customMetrics = {
  circuit_breaker_triggers: new Counter('circuit_breaker_triggers'),
  system_recovery_time: new Trend('system_recovery_time'),
  enrollment_processing_time: new Trend('enrollment_processing_time'),
  document_processing_time: new Trend('document_processing_time')
};

// Setup function to initialize test data and configuration
export function setup() {
  // Initialize test users with different roles
  const testUsers = {
    individual: {
      email: `test_individual_${Date.now()}@test.com`,
      password: 'Test123!@#'
    },
    broker: {
      email: `test_broker_${Date.now()}@test.com`,
      password: 'Test123!@#'
    },
    interviewer: {
      email: `test_interviewer_${Date.now()}@test.com`,
      password: 'Test123!@#'
    }
  };

  // Authenticate users and get tokens
  const tokens = {};
  for (const [role, user] of Object.entries(testUsers)) {
    const response = http.post(`${BASE_URL}/auth/login`, {
      email: user.email,
      password: user.password
    });
    tokens[role] = response.json('token');
  }

  // Prepare test enrollment data
  const testData = {
    tokens,
    enrollment: {
      personal_info: {
        name: 'Test User',
        email: 'test@example.com',
        phone: '+5511999999999'
      },
      documents: [
        { type: 'id', file: 'test-id.pdf' },
        { type: 'address', file: 'test-address.pdf' },
        { type: 'health', file: 'test-health.pdf' }
      ]
    }
  };

  return testData;
}

// Main enrollment handling function under spike load
export function handleEnrollment(testData) {
  const startTime = new Date();
  
  // Submit enrollment with retry logic
  const enrollmentResponse = http.post(`${BASE_URL}/enrollments`, {
    headers: {
      'Authorization': `Bearer ${testData.tokens.individual}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(testData.enrollment.personal_info)
  });

  // Check for circuit breaker activation
  if (enrollmentResponse.status === 503) {
    customMetrics.circuit_breaker_triggers.add(1);
    sleep(1); // Brief pause before retry
    return false;
  }

  check(enrollmentResponse, {
    'enrollment created successfully': (r) => r.status === 201,
    'response time within limits': (r) => r.timings.duration < 200
  });

  const enrollmentId = enrollmentResponse.json('id');
  
  // Process documents under load
  for (const doc of testData.enrollment.documents) {
    const docResponse = handleDocumentProcessing(testData.tokens.individual, enrollmentId, doc);
    if (!docResponse) return false;
  }

  // Record processing times
  const processingTime = new Date() - startTime;
  customMetrics.enrollment_processing_time.add(processingTime);

  return true;
}

// Document processing function
export function handleDocumentProcessing(token, enrollmentId, document) {
  const startTime = new Date();

  // Upload document with timeout and retry logic
  const docResponse = http.post(`${BASE_URL}/enrollments/${enrollmentId}/documents`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'multipart/form-data'
    },
    body: {
      type: document.type,
      file: http.file(document.file)
    },
    timeout: '10s'
  });

  // Handle potential circuit breaker activation
  if (docResponse.status === 503) {
    customMetrics.circuit_breaker_triggers.add(1);
    sleep(2); // Longer pause for document processing
    return false;
  }

  check(docResponse, {
    'document uploaded successfully': (r) => r.status === 201,
    'processing time within limits': (r) => r.timings.duration < 5000
  });

  // Record document processing time
  const processingTime = new Date() - startTime;
  customMetrics.document_processing_time.add(processingTime);

  return true;
}

// Teardown function for cleanup
export function teardown(testData) {
  // Clean up test enrollments
  const response = http.get(`${BASE_URL}/enrollments`, {
    headers: {
      'Authorization': `Bearer ${testData.tokens.individual}`
    }
  });

  const enrollments = response.json('data');
  
  for (const enrollment of enrollments) {
    http.del(`${BASE_URL}/enrollments/${enrollment.id}`, {
      headers: {
        'Authorization': `Bearer ${testData.tokens.individual}`
      }
    });
  }

  // Clean up test users
  for (const [role, token] of Object.entries(testData.tokens)) {
    http.del(`${BASE_URL}/users/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  }
}

// Default export for k6 execution
export default function() {
  const testData = setup();
  
  try {
    // Execute spike test scenario
    const success = handleEnrollment(testData);
    
    // Record system recovery if previous failure occurred
    if (success && customMetrics.circuit_breaker_triggers.value > 0) {
      customMetrics.system_recovery_time.add(new Date() - startTime);
    }
    
    // Add cool-down period between iterations
    sleep(1);
  } finally {
    teardown(testData);
  }
}