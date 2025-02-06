import { check, sleep } from 'k6';
import http from 'k6/http';
import { STAGES, THRESHOLDS, SCENARIOS } from './config.json';

// k6 v0.40.0
// http v0.40.0
// check v0.40.0

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api/v1';
const THINK_TIME = 1;
const ENDURANCE_DURATION = '4h';
const CLEANUP_INTERVAL = '30m';
const MAX_RETRIES = 3;

// Enhanced test configuration for 4-hour endurance run
export const options = {
  stages: [
    { duration: '30m', target: 50 },  // Gradual ramp-up
    { duration: '3h', target: 50 },   // Sustained load
    { duration: '30m', target: 0 }    // Graceful ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.01'],
    enrollment_success: ['rate>0.90'],
    memory_usage: ['value<90'],
    enrollment_completion_rate: ['rate>0.90']
  },
  scenarios: {
    enrollment_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: STAGES.load,
      gracefulRampDown: '5m'
    },
    document_processing: {
      executor: 'constant-vus',
      vus: 25,
      duration: ENDURANCE_DURATION
    },
    resource_monitoring: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: ENDURANCE_DURATION
    }
  }
};

// Enhanced setup function with resource monitoring
export function setup() {
  const testContext = {
    users: [],
    tokens: new Map(),
    resources: {
      startTime: Date.now(),
      metrics: new Map()
    },
    cleanup: {
      lastRun: Date.now(),
      interval: CLEANUP_INTERVAL
    }
  };

  // Initialize test users pool
  for (let i = 0; i < 100; i++) {
    const userData = {
      email: `test.user${i}@example.com`,
      password: 'Test@123',
      role: i % 5 === 0 ? 'broker' : 'individual'
    };

    const response = http.post(`${BASE_URL}/users`, JSON.stringify(userData), {
      headers: { 'Content-Type': 'application/json' }
    });

    check(response, {
      'user created successfully': (r) => r.status === 201
    });

    if (response.status === 201) {
      testContext.users.push(response.json());
      // Cache authentication token
      const authResponse = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
        email: userData.email,
        password: userData.password
      }));
      if (authResponse.status === 200) {
        testContext.tokens.set(response.json().id, authResponse.json().token);
      }
    }
  }

  // Initialize resource monitoring
  testContext.resources.metrics.set('memory', new Map());
  testContext.resources.metrics.set('cpu', new Map());
  testContext.resources.metrics.set('activeEnrollments', new Map());

  return testContext;
}

// Enhanced enrollment flow with comprehensive monitoring
export function enrollmentFlow(testContext) {
  const userId = testContext.users[Math.floor(Math.random() * testContext.users.length)].id;
  const token = testContext.tokens.get(userId);

  let retries = 0;
  let enrollmentId;

  while (retries < MAX_RETRIES && !enrollmentId) {
    const response = http.post(
      `${BASE_URL}/enrollments`,
      JSON.stringify({
        userId,
        type: 'individual',
        metadata: {
          source: 'endurance_test',
          timestamp: new Date().toISOString()
        }
      }),
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    check(response, {
      'enrollment created successfully': (r) => r.status === 201
    });

    if (response.status === 201) {
      enrollmentId = response.json().id;
    } else {
      retries++;
      sleep(THINK_TIME);
    }
  }

  if (enrollmentId) {
    // Document upload simulation with chunked transfer
    const documentTypes = ['identification', 'address_proof', 'health_declaration'];
    for (const docType of documentTypes) {
      const docResponse = http.put(
        `${BASE_URL}/enrollments/${enrollmentId}/documents`,
        JSON.stringify({
          type: docType,
          content: 'base64_encoded_content_simulation',
          checksum: 'sha256_checksum_simulation'
        }),
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      check(docResponse, {
        'document uploaded successfully': (r) => r.status === 200
      });

      sleep(THINK_TIME);
    }

    // Monitor document processing status
    let processingComplete = false;
    let processingAttempts = 0;

    while (!processingComplete && processingAttempts < 10) {
      const statusResponse = http.get(
        `${BASE_URL}/enrollments/${enrollmentId}/documents/status`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      check(statusResponse, {
        'document processing status retrieved': (r) => r.status === 200
      });

      if (statusResponse.json().status === 'completed') {
        processingComplete = true;
      } else {
        processingAttempts++;
        sleep(THINK_TIME * 2);
      }
    }
  }

  return { enrollmentId, success: !!enrollmentId };
}

// Enhanced document processing test with resource monitoring
export function documentProcessing(testContext) {
  const metrics = {
    processingTime: [],
    successRate: 0,
    resourceUsage: {
      memory: [],
      cpu: []
    }
  };

  const userId = testContext.users[Math.floor(Math.random() * testContext.users.length)].id;
  const token = testContext.tokens.get(userId);

  // Batch document processing simulation
  const batchSize = 5;
  let successCount = 0;

  for (let i = 0; i < batchSize; i++) {
    const startTime = Date.now();
    
    const response = http.post(
      `${BASE_URL}/documents/process`,
      JSON.stringify({
        content: 'base64_encoded_content_simulation',
        type: 'medical_record',
        priority: 'normal'
      }),
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    check(response, {
      'document processing initiated': (r) => r.status === 202
    });

    if (response.status === 202) {
      // Monitor processing status
      let processed = false;
      let attempts = 0;

      while (!processed && attempts < 5) {
        const statusResponse = http.get(
          `${BASE_URL}/documents/${response.json().id}/status`,
          {
            headers: { 'Authorization': `Bearer ${token}` }
          }
        );

        if (statusResponse.json().status === 'completed') {
          processed = true;
          successCount++;
          metrics.processingTime.push(Date.now() - startTime);
        }

        attempts++;
        sleep(THINK_TIME);
      }
    }

    // Collect resource metrics
    metrics.resourceUsage.memory.push(testContext.resources.metrics.get('memory').get(Date.now()));
    metrics.resourceUsage.cpu.push(testContext.resources.metrics.get('cpu').get(Date.now()));
  }

  metrics.successRate = successCount / batchSize;
  return metrics;
}

// Enhanced teardown with comprehensive cleanup
export function teardown(testContext) {
  // Clean up test enrollments
  testContext.users.forEach(user => {
    const token = testContext.tokens.get(user.id);
    http.del(`${BASE_URL}/users/${user.id}/enrollments`, null, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
  });

  // Clean up test users
  testContext.users.forEach(user => {
    http.del(`${BASE_URL}/users/${user.id}`);
  });

  // Generate final resource usage report
  const endTime = Date.now();
  const testDuration = endTime - testContext.resources.startTime;

  return {
    testDuration,
    resourceMetrics: {
      memory: Array.from(testContext.resources.metrics.get('memory').values()),
      cpu: Array.from(testContext.resources.metrics.get('cpu').values()),
      activeEnrollments: Array.from(testContext.resources.metrics.get('activeEnrollments').values())
    },
    cleanup: {
      users: testContext.users.length,
      tokens: testContext.tokens.size
    }
  };
}