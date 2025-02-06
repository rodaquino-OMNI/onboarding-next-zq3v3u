// @ts-check
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { STAGES, THRESHOLDS, SCENARIOS } from './config.json';

// Version: k6@0.40.0
// Purpose: Enterprise-grade performance testing suite for AUSTA Integration Platform

// Custom metrics
const enrollmentSuccess = new Rate('enrollment_success');
const documentProcessingTime = new Rate('document_processing_time');
const videoQualityScore = new Rate('video_quality_score');

// Global configuration
export const BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api/v1';
export const API_VERSION = 'v1';

// Test configuration
export const options = {
    stages: STAGES.performance,
    thresholds: THRESHOLDS,
    scenarios: SCENARIOS,
    userAgent: 'K6PerformanceTest/1.0',
    maxRedirects: 4,
    discardResponseBodies: true,
    noConnectionReuse: false,
    batchPerHost: 20
};

// Setup function - Prepares test data and environment
export function setup() {
    const testData = {
        users: generateTestUsers(100),
        documents: prepareTestDocuments(),
        templates: loadTemplates(),
        metrics: initializeMetrics()
    };

    // Validate test environment
    const healthCheck = http.get(`${BASE_URL}/health`);
    check(healthCheck, {
        'API health check passed': (r) => r.status === 200,
        'API version correct': (r) => r.json().version === API_VERSION
    });

    return testData;
}

// Main enrollment performance test scenario
export function handleEnrollment(data) {
    const params = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAuthToken()}`
        }
    };

    // Create enrollment
    const enrollmentResponse = http.post(`${BASE_URL}/enrollments`, {
        user_id: data.users[Math.floor(Math.random() * data.users.length)].id,
        type: 'individual',
        metadata: {
            source: 'performance_test',
            timestamp: new Date().toISOString()
        }
    }, params);

    check(enrollmentResponse, {
        'Enrollment created successfully': (r) => r.status === 201,
        'Valid enrollment ID returned': (r) => r.json().data.id !== undefined
    });

    sleep(1);

    // Document processing test
    const documentResponse = http.post(`${BASE_URL}/documents`, {
        enrollment_id: enrollmentResponse.json().data.id,
        documents: data.documents.slice(0, 3)
    }, params);

    check(documentResponse, {
        'Documents uploaded successfully': (r) => r.status === 200,
        'OCR processing initiated': (r) => r.json().status === 'processing'
    });

    documentProcessingTime.add(documentResponse.timings.duration);
    sleep(2);

    // Interview scheduling test
    const interviewResponse = http.post(`${BASE_URL}/interviews/schedule`, {
        enrollment_id: enrollmentResponse.json().data.id,
        preferred_slots: generateTimeSlots()
    }, params);

    check(interviewResponse, {
        'Interview scheduled successfully': (r) => r.status === 200,
        'Valid time slot assigned': (r) => r.json().data.scheduled_at !== undefined
    });

    enrollmentSuccess.add(
        enrollmentResponse.status === 201 && 
        documentResponse.status === 200 && 
        interviewResponse.status === 200 ? 1 : 0
    );
}

// Document processing performance test scenario
export function handleDocumentProcessing(data) {
    const params = {
        headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${getAuthToken()}`
        }
    };

    // Batch document processing
    const batchSize = 10;
    const documents = data.documents.slice(0, batchSize);
    
    const batchResponse = http.post(`${BASE_URL}/documents/batch`, {
        documents: documents,
        process_async: true,
        priority: 'high'
    }, params);

    check(batchResponse, {
        'Batch upload accepted': (r) => r.status === 202,
        'Processing IDs returned': (r) => r.json().data.process_ids.length === batchSize
    });

    // Monitor processing progress
    const processIds = batchResponse.json().data.process_ids;
    for (const processId of processIds) {
        const statusResponse = http.get(
            `${BASE_URL}/documents/status/${processId}`,
            params
        );

        check(statusResponse, {
            'Processing status available': (r) => r.status === 200,
            'Valid status returned': (r) => ['pending', 'processing', 'completed'].includes(r.json().status)
        });

        documentProcessingTime.add(statusResponse.timings.duration);
        sleep(1);
    }
}

// Cleanup and reporting
export function teardown(data) {
    // Clean up test data
    const cleanupResponse = http.delete(`${BASE_URL}/test-data`, {
        headers: {
            'Authorization': `Bearer ${getAuthToken()}`
        },
        body: {
            test_run_id: data.runId,
            cleanup_scope: 'all'
        }
    });

    check(cleanupResponse, {
        'Test data cleanup successful': (r) => r.status === 200
    });

    // Generate final metrics report
    console.log('Performance Test Summary:');
    console.log(`Enrollment Success Rate: ${enrollmentSuccess.rate}`);
    console.log(`Avg Document Processing Time: ${documentProcessingTime.rate}ms`);
    console.log(`Video Quality Score: ${videoQualityScore.rate}`);
}

// Helper functions
function generateTestUsers(count) {
    return Array(count).fill().map((_, index) => ({
        id: `test-user-${index}`,
        email: `performance-test-${index}@example.com`,
        role: index % 5 === 0 ? 'broker' : 'individual'
    }));
}

function prepareTestDocuments() {
    return [
        { type: 'id', size: '1MB', format: 'pdf' },
        { type: 'address', size: '2MB', format: 'jpg' },
        { type: 'health', size: '3MB', format: 'pdf' },
        { type: 'consent', size: '500KB', format: 'pdf' }
    ];
}

function loadTemplates() {
    return {
        enrollment: require('./templates/enrollment.json'),
        documents: require('./templates/documents.json'),
        interview: require('./templates/interview.json')
    };
}

function initializeMetrics() {
    return {
        startTime: new Date(),
        counters: {
            enrollments: 0,
            documents: 0,
            interviews: 0
        },
        errors: new Map()
    };
}

function generateTimeSlots() {
    const slots = [];
    const baseDate = new Date();
    for (let i = 1; i <= 3; i++) {
        const date = new Date(baseDate);
        date.setDate(date.getDate() + i);
        slots.push(date.toISOString());
    }
    return slots;
}

function getAuthToken() {
    // Implement token generation/caching logic
    return 'performance-test-token';
}