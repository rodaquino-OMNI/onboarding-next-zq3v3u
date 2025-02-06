#!/bin/bash

# AUSTA Integration Platform - Test Environment Cleanup Script
# Version: 1.0.0
# Description: Enterprise-grade shell script for secure cleanup of test environment resources

# Enable strict error handling
set -euo pipefail
IFS=$'\n\t'

# Global variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_COMPOSE_FILE="${SCRIPT_DIR}/../docker-compose.test.yml"
LOG_FILE="/var/log/test-cleanup.log"
CLEANUP_TIMEOUT=300
MAX_RETRIES=3
ALERT_WEBHOOK="https://alerts.austa.local/cleanup"

# Logging function with ISO 8601 timestamps
log() {
    local level=$1
    local message=$2
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [${level}] ${message}" | tee -a "${LOG_FILE}"
}

# Check prerequisites and permissions
check_prerequisites() {
    log "INFO" "Checking prerequisites..."

    # Verify Docker Compose version
    if ! command -v docker-compose &> /dev/null; then
        log "ERROR" "docker-compose not found"
        return 1
    fi

    local version
    version=$(docker-compose --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1)
    if [[ "${version}" < "2.0.0" ]]; then
        log "ERROR" "docker-compose version must be >= 2.0.0"
        return 1
    }

    # Check Docker Compose file exists
    if [[ ! -f "${DOCKER_COMPOSE_FILE}" ]]; then
        log "ERROR" "Docker Compose file not found: ${DOCKER_COMPOSE_FILE}"
        return 1
    }

    # Verify required permissions
    if [[ $EUID -ne 0 ]]; then
        log "ERROR" "This script must be run as root"
        return 1
    }

    # Check disk space
    local available_space
    available_space=$(df -P /var/lib/docker | awk 'NR==2 {print $4}')
    if [[ ${available_space} -lt 1048576 ]]; then  # 1GB in KB
        log "WARNING" "Low disk space detected"
    }

    return 0
}

# Stop and remove test containers
stop_test_containers() {
    log "INFO" "Stopping test containers..."
    
    # Get list of running test containers
    local containers
    containers=$(docker-compose -f "${DOCKER_COMPOSE_FILE}" ps -q)

    if [[ -n "${containers}" ]]; then
        # Stop containers with timeout
        if ! docker-compose -f "${DOCKER_COMPOSE_FILE}" stop -t "${CLEANUP_TIMEOUT}"; then
            log "WARNING" "Graceful stop failed, forcing removal..."
            docker-compose -f "${DOCKER_COMPOSE_FILE}" kill
        fi

        # Remove containers and networks
        docker-compose -f "${DOCKER_COMPOSE_FILE}" rm -f
    else
        log "INFO" "No running test containers found"
    fi
}

# Securely cleanup test volumes
cleanup_test_volumes() {
    log "INFO" "Cleaning up test volumes..."

    # Get list of test volumes
    local volumes
    volumes=$(docker volume ls -q -f name=test)

    for volume in ${volumes}; do
        # Secure wipe for volumes containing sensitive data
        if [[ "${volume}" == *"mysql"* ]] || [[ "${volume}" == *"redis"* ]]; then
            log "INFO" "Secure wiping volume: ${volume}"
            docker run --rm -v "${volume}:/data" alpine:latest sh -c "dd if=/dev/urandom of=/data/wipe bs=1M count=10 && rm -rf /data/*"
        fi

        # Remove volume with retry mechanism
        local retry_count=0
        while ! docker volume rm "${volume}" && [[ ${retry_count} -lt ${MAX_RETRIES} ]]; do
            log "WARNING" "Failed to remove volume ${volume}, retrying..."
            ((retry_count++))
            sleep 5
        done

        if [[ ${retry_count} -eq ${MAX_RETRIES} ]]; then
            log "ERROR" "Failed to remove volume ${volume} after ${MAX_RETRIES} attempts"
            return 1
        fi
    done
}

# Cleanup test network
cleanup_test_network() {
    log "INFO" "Cleaning up test network..."

    local network_name="test-network"
    
    # Check if network exists
    if docker network inspect "${network_name}" &>/dev/null; then
        # Disconnect any connected containers
        local containers
        containers=$(docker network inspect "${network_name}" -f '{{range .Containers}}{{.Name}} {{end}}')
        
        for container in ${containers}; do
            docker network disconnect -f "${network_name}" "${container}" || true
        done

        # Remove network
        if ! docker network rm "${network_name}"; then
            log "ERROR" "Failed to remove test network"
            return 1
        fi
    else
        log "INFO" "Test network not found"
    fi
}

# Secure cleanup of temporary files
secure_cleanup_files() {
    log "INFO" "Cleaning up temporary files..."

    local temp_dirs=(
        "/tmp/test-*"
        "/var/tmp/test-*"
        "${SCRIPT_DIR}/../coverage"
        "${SCRIPT_DIR}/../reports"
    )

    for dir in "${temp_dirs[@]}"; do
        if [[ -d "${dir}" ]]; then
            # Secure deletion of sensitive files
            find "${dir}" -type f -exec shred -u {} \;
            rm -rf "${dir}"
        fi
    done
}

# Verify cleanup completion
verify_cleanup() {
    log "INFO" "Verifying cleanup..."

    local failed=0

    # Check for remaining containers
    if docker-compose -f "${DOCKER_COMPOSE_FILE}" ps -q | grep -q .; then
        log "ERROR" "Containers still running"
        failed=1
    fi

    # Check for remaining volumes
    if docker volume ls -q -f name=test | grep -q .; then
        log "ERROR" "Test volumes still exist"
        failed=1
    fi

    # Check for remaining networks
    if docker network ls -q -f name=test-network | grep -q .; then
        log "ERROR" "Test network still exists"
        failed=1
    fi

    return ${failed}
}

# Send alert on failure
send_alert() {
    local message=$1
    curl -X POST "${ALERT_WEBHOOK}" \
        -H "Content-Type: application/json" \
        -d "{\"message\":\"${message}\",\"severity\":\"error\",\"source\":\"cleanup-test-env\"}" || true
}

# Main cleanup function
main() {
    local start_time
    start_time=$(date +%s)

    log "INFO" "Starting test environment cleanup..."

    # Initialize cleanup status
    local cleanup_status=0

    # Check prerequisites
    if ! check_prerequisites; then
        log "ERROR" "Prerequisites check failed"
        send_alert "Cleanup failed: prerequisites check failed"
        exit 1
    fi

    # Execute cleanup steps with error handling
    {
        stop_test_containers && \
        cleanup_test_volumes && \
        cleanup_test_network && \
        secure_cleanup_files
    } || {
        cleanup_status=1
        log "ERROR" "Cleanup failed"
        send_alert "Test environment cleanup failed"
    }

    # Verify cleanup
    if ! verify_cleanup; then
        cleanup_status=1
        log "ERROR" "Cleanup verification failed"
        send_alert "Cleanup verification failed"
    fi

    # Calculate execution time
    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))

    log "INFO" "Cleanup completed in ${duration} seconds with status: ${cleanup_status}"

    exit ${cleanup_status}
}

# Execute main function
main