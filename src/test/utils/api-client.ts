/**
 * @fileoverview Enhanced test API client for healthcare enrollment system
 * Implements HIPAA-compliant API testing with retry mechanisms and error handling
 * @version 1.0.0
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios'; // ^1.4.0
import rax from 'retry-axios'; // ^3.0.0
import { Document, DocumentUploadResponse } from '../../web/src/app/core/interfaces/document.interface';

// Global configuration constants
const DEFAULT_API_URL = 'http://localhost:8000/api/v1';
const DEFAULT_TIMEOUT = 5000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

/**
 * API error interface for standardized error handling
 */
interface APIError {
  code: string;
  message: string;
  details?: Record<string, any>;
  requestId?: string;
  timestamp: string;
}

/**
 * Retry configuration interface
 */
interface RetryConfig {
  retry: number;
  retryDelay: number;
  httpMethodsToRetry?: string[];
  statusCodesToRetry?: number[];
}

/**
 * Enhanced API client for testing healthcare enrollment system
 * Implements HIPAA-compliant request handling with retry mechanisms
 */
export class APIClient {
  private baseUrl: string;
  private authToken: string | null;
  private defaultHeaders: Record<string, string>;
  private axiosInstance: AxiosInstance;
  private retryConfig: RetryConfig;

  /**
   * Initializes API client with enhanced configuration
   * @param baseUrl - Optional base URL for API requests
   * @param config - Optional configuration overrides
   */
  constructor(
    baseUrl?: string,
    config: Partial<AxiosRequestConfig> = {}
  ) {
    this.baseUrl = baseUrl || DEFAULT_API_URL;
    this.authToken = null;

    // Initialize HIPAA-compliant headers
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'X-HIPAA-Compliance': 'enabled',
      'X-Request-ID': '',
      'X-Client-Version': '1.0.0',
    };

    // Configure axios instance with interceptors
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: config.timeout || DEFAULT_TIMEOUT,
      headers: this.defaultHeaders,
      ...config
    });

    // Configure default retry behavior
    this.retryConfig = {
      retry: MAX_RETRIES,
      retryDelay: RETRY_DELAY,
      httpMethodsToRetry: ['GET', 'PUT', 'POST', 'DELETE', 'PATCH'],
      statusCodesToRetry: [[408, 429, 500, 502, 503, 504]]
    };

    this.configureRetry(this.retryConfig);
    this.setupInterceptors();
  }

  /**
   * Configures retry behavior for failed requests
   * @param retryConfig - Retry configuration options
   */
  public configureRetry(retryConfig: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...retryConfig };
    
    const raxConfig = {
      retry: this.retryConfig.retry,
      retryDelay: this.retryConfig.retryDelay,
      httpMethodsToRetry: this.retryConfig.httpMethodsToRetry,
      statusCodesToRetry: this.retryConfig.statusCodesToRetry,
      onRetryAttempt: (err: AxiosError) => {
        const cfg = rax.getConfig(err);
        console.log(`Retry attempt #${cfg?.currentRetryAttempt}`);
      }
    };

    this.axiosInstance.defaults.raxConfig = raxConfig;
    rax.attach(this.axiosInstance);
  }

  /**
   * Sets authentication token for requests
   * @param token - JWT authentication token
   */
  public setAuthToken(token: string): void {
    this.authToken = token;
    this.defaultHeaders['Authorization'] = `Bearer ${token}`;
    this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Handles and standardizes API errors
   * @param error - Error object from failed request
   * @returns Standardized API error
   */
  private handleError(error: AxiosError): APIError {
    const timestamp = new Date().toISOString();
    
    if (error.response) {
      return {
        code: error.response.status.toString(),
        message: error.response.data?.message || error.message,
        details: error.response.data,
        requestId: error.response.headers['x-request-id'],
        timestamp
      };
    }

    return {
      code: 'NETWORK_ERROR',
      message: error.message,
      timestamp
    };
  }

  /**
   * Configures request interceptors for authentication and HIPAA compliance
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      (config) => {
        config.headers['X-Request-ID'] = this.generateRequestId();
        return config;
      },
      (error) => Promise.reject(this.handleError(error))
    );

    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => Promise.reject(this.handleError(error))
    );
  }

  /**
   * Generates unique request ID for tracking
   * @returns Unique request identifier
   */
  private generateRequestId(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Uploads document with HIPAA compliance
   * @param document - Document metadata
   * @param file - File to upload
   * @returns Upload response with secure credentials
   */
  public async uploadDocument(
    document: Partial<Document>,
    file: File
  ): Promise<DocumentUploadResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('metadata', JSON.stringify(document));

      const response = await this.axiosInstance.post<DocumentUploadResponse>(
        '/documents/upload',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            'X-Document-Type': document.type,
          }
        }
      );

      return response.data;
    } catch (error) {
      throw this.handleError(error as AxiosError);
    }
  }

  /**
   * Retrieves document with encryption handling
   * @param documentId - Document identifier
   * @returns Document metadata and content
   */
  public async getDocument(documentId: string): Promise<Document> {
    try {
      const response = await this.axiosInstance.get<Document>(
        `/documents/${documentId}`
      );
      return response.data;
    } catch (error) {
      throw this.handleError(error as AxiosError);
    }
  }

  /**
   * Verifies document with audit trail
   * @param documentId - Document identifier
   * @param verificationData - Verification metadata
   * @returns Updated document status
   */
  public async verifyDocument(
    documentId: string,
    verificationData: Record<string, any>
  ): Promise<Document> {
    try {
      const response = await this.axiosInstance.post<Document>(
        `/documents/${documentId}/verify`,
        verificationData
      );
      return response.data;
    } catch (error) {
      throw this.handleError(error as AxiosError);
    }
  }
}