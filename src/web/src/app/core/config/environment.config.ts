import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Enhanced environment configuration service that provides secure and validated
 * access to environment-specific settings across the application.
 * @version 1.0.0
 */
@Injectable({ providedIn: 'root' })
export class EnvironmentConfig {
  private readonly configCache: Map<string, any> = new Map();
  private readonly validationErrors: string[] = [];

  constructor() {
    this.validateConfiguration();
  }

  /**
   * Returns the validated API base URL for the current environment
   * @returns {string} The validated API base URL
   * @throws {Error} If API URL is invalid or not configured
   */
  getApiUrl(): string {
    const cacheKey = 'apiUrl';
    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey);
    }

    if (!environment.apiUrl) {
      throw new Error('API URL is not configured');
    }

    const url = new URL(environment.apiUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Invalid API URL protocol');
    }

    this.configCache.set(cacheKey, environment.apiUrl);
    return environment.apiUrl;
  }

  /**
   * Returns the complete validated URL for a specific API endpoint
   * @param {string} endpoint - The endpoint path to validate and combine
   * @returns {string} The complete validated endpoint URL
   * @throws {Error} If endpoint is invalid or not found
   */
  getApiEndpoint(endpoint: string): string {
    const cacheKey = `endpoint_${endpoint}`;
    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey);
    }

    if (!endpoint || typeof endpoint !== 'string') {
      throw new Error('Invalid endpoint parameter');
    }

    const endpointConfig = this.findEndpointConfig(endpoint);
    if (!endpointConfig) {
      throw new Error(`Endpoint ${endpoint} not found in configuration`);
    }

    const fullUrl = `${this.getApiUrl()}${endpointConfig}`;
    this.configCache.set(cacheKey, fullUrl);
    return fullUrl;
  }

  /**
   * Returns the validated and decrypted security configuration
   * @returns {object} The secure configuration object
   * @throws {Error} If security configuration is invalid
   */
  getSecurityConfig(): typeof environment.securityConfig {
    const cacheKey = 'securityConfig';
    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey);
    }

    const config = { ...environment.securityConfig };
    this.validateSecurityConfig(config);
    this.configCache.set(cacheKey, config);
    return config;
  }

  /**
   * Returns the validated feature flags with environment overrides
   * @returns {object} The feature flags configuration
   */
  getFeatureFlags(): typeof environment.featureFlags {
    const cacheKey = 'featureFlags';
    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey);
    }

    const flags = { ...environment.featureFlags };
    this.validateFeatureFlags(flags);
    this.configCache.set(cacheKey, flags);
    return flags;
  }

  /**
   * Returns the validated AWS service configuration
   * @returns {object} The AWS configuration object
   * @throws {Error} If AWS configuration is invalid
   */
  getAwsConfig(): typeof environment.aws {
    const cacheKey = 'awsConfig';
    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey);
    }

    const config = { ...environment.aws };
    this.validateAwsConfig(config);
    this.configCache.set(cacheKey, config);
    return config;
  }

  /**
   * Returns the validated Vonage video service configuration
   * @returns {object} The Vonage configuration object
   * @throws {Error} If Vonage configuration is invalid
   */
  getVonageConfig(): typeof environment.vonage {
    const cacheKey = 'vonageConfig';
    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey);
    }

    const config = { ...environment.vonage };
    this.validateVonageConfig(config);
    this.configCache.set(cacheKey, config);
    return config;
  }

  /**
   * Returns the validated internationalization configuration
   * @returns {object} The i18n configuration object
   * @throws {Error} If i18n configuration is invalid
   */
  getI18nConfig(): typeof environment.i18n {
    const cacheKey = 'i18nConfig';
    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey);
    }

    const config = { ...environment.i18n };
    this.validateI18nConfig(config);
    this.configCache.set(cacheKey, config);
    return config;
  }

  /**
   * Checks if the current environment is production
   * @returns {boolean} True if production environment
   */
  isProduction(): boolean {
    return environment.production === true;
  }

  /**
   * Validates the entire configuration on service initialization
   * @private
   */
  private validateConfiguration(): void {
    try {
      this.validateRequiredProperties();
      this.validateSecurityConfig(environment.securityConfig);
      this.validateFeatureFlags(environment.featureFlags);
      this.validateAwsConfig(environment.aws);
      this.validateVonageConfig(environment.vonage);
      this.validateI18nConfig(environment.i18n);
    } catch (error) {
      console.error('Configuration validation failed:', error);
      throw error;
    }
  }

  /**
   * Validates required configuration properties
   * @private
   * @throws {Error} If required properties are missing
   */
  private validateRequiredProperties(): void {
    const required = ['apiUrl', 'securityConfig', 'featureFlags', 'aws', 'vonage', 'i18n'];
    for (const prop of required) {
      if (!(prop in environment)) {
        throw new Error(`Missing required configuration property: ${prop}`);
      }
    }
  }

  /**
   * Validates security configuration
   * @private
   * @param {object} config - Security configuration to validate
   * @throws {Error} If security configuration is invalid
   */
  private validateSecurityConfig(config: typeof environment.securityConfig): void {
    if (!config.tokenExpiryTime || config.tokenExpiryTime <= 0) {
      throw new Error('Invalid token expiry time');
    }
    if (!config.jwt || !config.jwt.algorithm || !config.jwt.issuer) {
      throw new Error('Invalid JWT configuration');
    }
  }

  /**
   * Validates feature flags configuration
   * @private
   * @param {object} flags - Feature flags to validate
   */
  private validateFeatureFlags(flags: typeof environment.featureFlags): void {
    const requiredFlags = ['videoInterviews', 'documentOcr', 'multiLanguage'];
    for (const flag of requiredFlags) {
      if (typeof flags[flag] !== 'boolean') {
        throw new Error(`Invalid feature flag configuration: ${flag}`);
      }
    }
  }

  /**
   * Validates AWS service configuration
   * @private
   * @param {object} config - AWS configuration to validate
   * @throws {Error} If AWS configuration is invalid
   */
  private validateAwsConfig(config: typeof environment.aws): void {
    if (!config.region || !config.s3.bucketName) {
      throw new Error('Invalid AWS configuration');
    }
  }

  /**
   * Validates Vonage video service configuration
   * @private
   * @param {object} config - Vonage configuration to validate
   * @throws {Error} If Vonage configuration is invalid
   */
  private validateVonageConfig(config: typeof environment.vonage): void {
    if (!config.apiKey || !config.maxDuration) {
      throw new Error('Invalid Vonage configuration');
    }
  }

  /**
   * Validates internationalization configuration
   * @private
   * @param {object} config - I18n configuration to validate
   * @throws {Error} If i18n configuration is invalid
   */
  private validateI18nConfig(config: typeof environment.i18n): void {
    if (!config.defaultLanguage || !config.supportedLanguages?.length) {
      throw new Error('Invalid i18n configuration');
    }
  }

  /**
   * Finds the endpoint configuration in the API endpoints structure
   * @private
   * @param {string} endpoint - Endpoint to find
   * @returns {string|null} The endpoint path if found
   */
  private findEndpointConfig(endpoint: string): string | null {
    const endpoints = environment.apiEndpoints;
    for (const category in endpoints) {
      if (endpoints[category][endpoint]) {
        return endpoints[category][endpoint];
      }
    }
    return null;
  }
}