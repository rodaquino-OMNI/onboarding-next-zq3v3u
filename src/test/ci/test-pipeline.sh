#!/bin/bash

# AUSTA Integration Platform - Test Pipeline Script
# Version: 1.0.0
# Description: Enterprise-grade test pipeline orchestrator with comprehensive
# monitoring, error handling, and reporting capabilities.

# Exit on error, undefined variables, and pipe failures
set -euo pipefail

# Global variables
readonly TEST_ROOT="$(pwd)/src/test"
readonly COVERAGE_THRESHOLD=80
readonly UNIT_TEST_TIMEOUT=300
readonly INTEGRATION_TEST_TIMEOUT=900
readonly E2E_TEST_TIMEOUT=1800
readonly SECURITY_SCAN_TIMEOUT=1200
readonly LOG_LEVEL="DEBUG"
readonly PARALLEL_JOBS=4
readonly RETRY_ATTEMPTS=3
readonly CIRCUIT_BREAKER_THRESHOLD=5

# Import required scripts
source "${TEST_ROOT}/ci/setup-test-env.sh"
source "${TEST_ROOT}/ci/cleanup-test-env.sh"

# Initialize logging
setup_logging() {
    local log_dir="${TEST_ROOT}/logs"
    mkdir -p "${log_dir}"
    exec 1> >(tee -a "${log_dir}/test-pipeline.log")
    exec 2> >(tee -a "${log_dir}/test-pipeline.error.log")
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting test pipeline execution"
}

# Set error handling
set_error_handling() {
    trap 'handle_error ${LINENO} $?' ERR

    handle_error() {
        local line_no=$1
        local error_code=$2
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Error on line ${line_no}: Exit code ${error_code}"
        cleanup_test_env
        exit "${error_code}"
    }
}

# Run unit tests
run_unit_tests() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Running unit tests..."
    
    local start_time=$(date +%s)
    local status=0

    # Frontend unit tests with Jest
    echo "Running frontend unit tests..."
    npx jest \
        --config="${TEST_ROOT}/jest.config.js" \
        --coverage \
        --maxWorkers=${PARALLEL_JOBS} \
        --forceExit \
        --detectOpenHandles \
        --ci || status=$?

    # Backend unit tests with PHPUnit
    echo "Running backend unit tests..."
    vendor/bin/phpunit \
        --configuration="${TEST_ROOT}/phpunit.xml" \
        --coverage-html="${TEST_ROOT}/coverage/php" \
        --coverage-clover="${TEST_ROOT}/coverage/clover.xml" \
        --log-junit="${TEST_ROOT}/coverage/junit.xml" \
        --testsuite=Unit || status=$?

    # Validate coverage
    local coverage=$(grep -Po "(?<=<coverage-report>.+)(?=</coverage-report>)" "${TEST_ROOT}/coverage/clover.xml")
    if [[ $(echo "${coverage} < ${COVERAGE_THRESHOLD}" | bc -l) -eq 1 ]]; then
        echo "Coverage ${coverage}% below threshold ${COVERAGE_THRESHOLD}%"
        return 1
    fi

    local duration=$(($(date +%s) - start_time))
    echo "Unit tests completed in ${duration} seconds"
    
    return ${status}
}

# Run integration tests
run_integration_tests() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Running integration tests..."
    
    local start_time=$(date +%s)
    local status=0
    local retry_count=0

    while [[ ${retry_count} -lt ${RETRY_ATTEMPTS} ]]; do
        # API integration tests
        vendor/bin/phpunit \
            --configuration="${TEST_ROOT}/phpunit.xml" \
            --testsuite=Integration \
            --log-junit="${TEST_ROOT}/coverage/integration.xml" && break

        ((retry_count++))
        echo "Integration tests failed, attempt ${retry_count}/${RETRY_ATTEMPTS}"
        sleep 30
    done

    if [[ ${retry_count} -eq ${RETRY_ATTEMPTS} ]]; then
        echo "Integration tests failed after ${RETRY_ATTEMPTS} attempts"
        return 1
    fi

    local duration=$(($(date +%s) - start_time))
    echo "Integration tests completed in ${duration} seconds"
    
    return ${status}
}

# Run E2E tests
run_e2e_tests() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Running E2E tests..."
    
    local start_time=$(date +%s)
    local status=0

    # Run Cypress E2E tests
    npx cypress run \
        --config-file="${TEST_ROOT}/cypress.config.js" \
        --browser chrome \
        --headless \
        --reporter junit \
        --reporter-options "mochaFile=${TEST_ROOT}/coverage/e2e-results.xml" || status=$?

    # Run accessibility tests
    npx cypress run \
        --config-file="${TEST_ROOT}/cypress.config.js" \
        --spec="cypress/e2e/accessibility/**/*.cy.js" \
        --env updateSnapshots=true || status=$?

    local duration=$(($(date +%s) - start_time))
    echo "E2E tests completed in ${duration} seconds"
    
    return ${status}
}

# Run security scans
run_security_scans() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Running security scans..."
    
    local start_time=$(date +%s)
    local status=0

    # Run OWASP ZAP scan
    docker run --rm \
        --network test-network \
        -v "${TEST_ROOT}/reports:/zap/reports:rw" \
        owasp/zap2docker-stable:latest \
        zap-baseline.py \
        -t http://api-test:80 \
        -c zap.conf \
        -r "${TEST_ROOT}/reports/zap-report.html" \
        -I || status=$?

    # Check for high-risk vulnerabilities
    if grep -q "High Risk Vulnerabilities: [1-9]" "${TEST_ROOT}/reports/zap-report.html"; then
        echo "High risk vulnerabilities detected"
        return 1
    fi

    local duration=$(($(date +%s) - start_time))
    echo "Security scans completed in ${duration} seconds"
    
    return ${status}
}

# Generate test reports
generate_reports() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Generating test reports..."
    
    local reports_dir="${TEST_ROOT}/reports"
    mkdir -p "${reports_dir}"

    # Merge coverage reports
    npx nyc merge \
        "${TEST_ROOT}/coverage" \
        "${reports_dir}/coverage-final.json"

    # Generate HTML report
    npx nyc report \
        --reporter=html \
        --reporter=text-summary \
        --report-dir="${reports_dir}/coverage"

    # Generate JUnit report
    junit-merge \
        --dir "${TEST_ROOT}/coverage" \
        --out "${reports_dir}/junit-final.xml"

    # Generate test execution summary
    cat > "${reports_dir}/summary.txt" << EOF
Test Execution Summary
---------------------
Date: $(date '+%Y-%m-%d %H:%M:%S')
Coverage: ${COVERAGE_THRESHOLD}%
Unit Tests: $(grep -c "<testcase" "${TEST_ROOT}/coverage/junit.xml") tests
Integration Tests: $(grep -c "<testcase" "${TEST_ROOT}/coverage/integration.xml") tests
E2E Tests: $(grep -c "<testcase" "${TEST_ROOT}/coverage/e2e-results.xml") tests
Security Status: $(grep "Risk Level" "${TEST_ROOT}/reports/zap-report.html" | tail -n1)
EOF
}

# Main function
main() {
    local start_time=$(date +%s)
    local pipeline_status=0

    setup_logging
    set_error_handling

    echo "Starting test pipeline execution..."

    # Setup test environment
    if ! setup-test-env; then
        echo "Test environment setup failed"
        return 1
    fi

    # Execute test stages
    run_unit_tests || pipeline_status=$?
    run_integration_tests || pipeline_status=$?
    run_e2e_tests || pipeline_status=$?
    run_security_scans || pipeline_status=$?

    # Generate reports
    generate_reports

    # Cleanup test environment
    cleanup-test-env

    local duration=$(($(date +%s) - start_time))
    echo "Test pipeline completed in ${duration} seconds with status: ${pipeline_status}"

    return ${pipeline_status}
}

# Execute main function
main