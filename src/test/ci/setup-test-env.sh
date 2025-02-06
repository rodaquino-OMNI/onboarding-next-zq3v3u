#!/bin/bash

# AUSTA Integration Platform - Test Environment Setup Script
# Version: 1.0.0
# Description: Enterprise-grade script for setting up test environment with
# comprehensive security controls and automated validation

# Exit on error, undefined variables, and pipe failures
set -euo pipefail

# Global variables
readonly TEST_ROOT="$(pwd)/src/test"
readonly DOCKER_COMPOSE_FILE="${TEST_ROOT}/docker-compose.test.yml"
readonly LOG_DIR="${TEST_ROOT}/logs"
readonly COVERAGE_THRESHOLD=80
readonly MAX_RETRIES=3
readonly HEALTH_CHECK_TIMEOUT=300

# Initialize logging
setup_logging() {
    mkdir -p "${LOG_DIR}"
    exec 1> >(tee -a "${LOG_DIR}/setup.log")
    exec 2> >(tee -a "${LOG_DIR}/setup.error.log")
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting test environment setup"
}

# Error handling
handle_error() {
    local line_no=$1
    local error_code=$2
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Error on line ${line_no}: Exit code ${error_code}"
    cleanup_environment
    exit "${error_code}"
}

trap 'handle_error ${LINENO} $?' ERR

# Validate system requirements
check_system_requirements() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Validating system requirements..."
    
    # Check disk space (minimum 10GB free)
    local free_space=$(df -BG . | awk 'NR==2 {print $4}' | sed 's/G//')
    if [ "${free_space}" -lt 10 ]; then
        echo "Error: Insufficient disk space. Required: 10GB, Available: ${free_space}GB"
        exit 1
    fi

    # Check memory (minimum 4GB)
    local total_mem=$(free -g | awk '/^Mem:/{print $2}')
    if [ "${total_mem}" -lt 4 ]; then
        echo "Error: Insufficient memory. Required: 4GB, Available: ${total_mem}GB"
        exit 1
    fi

    # Check Docker version
    if ! docker --version | grep -q "version 20"; then
        echo "Error: Docker version 20.x is required"
        exit 1
    fi

    # Check Docker Compose version
    if ! docker-compose --version | grep -q "version 2"; then
        echo "Error: Docker Compose version 2.x is required"
        exit 1
    }
}

# Validate dependencies
check_dependencies() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Checking dependencies..."
    
    local required_commands=(
        "docker"
        "docker-compose"
        "node"
        "npm"
        "php"
        "composer"
    )

    for cmd in "${required_commands[@]}"; do
        if ! command -v "${cmd}" &> /dev/null; then
            echo "Error: Required command '${cmd}' not found"
            exit 1
        fi
    done

    # Verify Node.js version
    if ! node --version | grep -q "v16"; then
        echo "Error: Node.js version 16.x is required"
        exit 1
    }

    # Verify PHP version
    if ! php --version | grep -q "PHP 8.1"; then
        echo "Error: PHP version 8.1.x is required"
        exit 1
    }
}

# Setup Docker environment
setup_docker_environment() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Setting up Docker environment..."

    # Create Docker network if not exists
    docker network inspect test-network >/dev/null 2>&1 || \
        docker network create --driver bridge test-network

    # Pull required images
    docker-compose -f "${DOCKER_COMPOSE_FILE}" pull

    # Start containers
    docker-compose -f "${DOCKER_COMPOSE_FILE}" up -d

    # Wait for services to be healthy
    local retries=0
    while [ $retries -lt $MAX_RETRIES ]; do
        if docker-compose -f "${DOCKER_COMPOSE_FILE}" ps | grep -q "healthy"; then
            echo "All services are healthy"
            break
        fi
        echo "Waiting for services to be healthy... (${retries}/${MAX_RETRIES})"
        sleep 10
        ((retries++))
    done

    if [ $retries -eq $MAX_RETRIES ]; then
        echo "Error: Services failed to become healthy"
        exit 1
    fi
}

# Setup Node.js environment
setup_node_environment() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Setting up Node.js environment..."

    # Install dependencies
    npm ci --prefix "${TEST_ROOT}"

    # Setup Jest configuration
    cat > "${TEST_ROOT}/jest.config.js" << EOF
module.exports = {
    coverageThreshold: {
        global: {
            statements: ${COVERAGE_THRESHOLD},
            branches: ${COVERAGE_THRESHOLD},
            functions: ${COVERAGE_THRESHOLD},
            lines: ${COVERAGE_THRESHOLD}
        }
    },
    collectCoverage: true,
    coverageReporters: ['text', 'html', 'json'],
    coverageDirectory: 'coverage'
};
EOF
}

# Setup PHP environment
setup_php_environment() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Setting up PHP environment..."

    # Install Composer dependencies
    composer install --no-interaction --no-progress --working-dir="${TEST_ROOT}"

    # Setup PHPUnit configuration
    cat > "${TEST_ROOT}/phpunit.xml" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<phpunit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="./vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="vendor/autoload.php"
         colors="true">
    <coverage processUncoveredFiles="true">
        <include>
            <directory suffix=".php">../app</directory>
        </include>
        <report>
            <html outputDirectory="coverage"/>
            <text outputFile="coverage.txt"/>
        </report>
    </coverage>
</phpunit>
EOF
}

# Setup test data
setup_test_data() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Setting up test data..."

    # Run database migrations
    docker-compose -f "${DOCKER_COMPOSE_FILE}" exec -T api-test php artisan migrate:fresh --seed --env=testing

    # Verify database setup
    if ! docker-compose -f "${DOCKER_COMPOSE_FILE}" exec -T mysql-test mysqladmin ping -h localhost -u test_user --password=test_password; then
        echo "Error: Database setup failed"
        exit 1
    fi
}

# Cleanup environment
cleanup_environment() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cleaning up environment..."

    # Stop and remove containers
    docker-compose -f "${DOCKER_COMPOSE_FILE}" down -v --remove-orphans

    # Clean up temporary files
    rm -rf "${TEST_ROOT}/node_modules"
    rm -rf "${TEST_ROOT}/vendor"
    rm -rf "${TEST_ROOT}/coverage"

    # Archive logs
    tar -czf "${LOG_DIR}/logs-$(date '+%Y%m%d_%H%M%S').tar.gz" "${LOG_DIR}"/*.log
}

# Main function
main() {
    setup_logging
    check_system_requirements
    check_dependencies
    setup_docker_environment
    setup_node_environment
    setup_php_environment
    setup_test_data
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Test environment setup completed successfully"
}

# Execute main function
main