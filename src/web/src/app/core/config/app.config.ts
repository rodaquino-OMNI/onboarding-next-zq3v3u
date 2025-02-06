import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { EnvironmentConfig } from './environment.config';

/**
 * Enhanced application configuration service that provides secure and validated
 * access to global application settings with audit logging and caching capabilities.
 * Implements zero-trust principles and HIPAA compliance requirements.
 * @version 1.0.0
 */
@Injectable({ providedIn: 'root' })
export class AppConfig {
  private readonly appTitle = 'AUSTA Integration Platform';
  private readonly appVersion = '1.0.0';
  private readonly configCache: Map<string, any> = new Map();
  private readonly auditLogger: ConfigAuditLogger;

  constructor(private readonly environmentConfig: EnvironmentConfig) {
    this.validateAndInitialize();
    this.auditLogger = new ConfigAuditLogger();
  }

  /**
   * Returns the validated application title with audit logging
   * @returns {string} The application title
   */
  getAppTitle(): string {
    const cacheKey = 'appTitle';
    this.auditLogger.logAccess('getAppTitle');

    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey);
    }

    this.configCache.set(cacheKey, this.appTitle);
    return this.appTitle;
  }

  /**
   * Returns the validated application version with security checks
   * @returns {string} The application version
   */
  getAppVersion(): string {
    const cacheKey = 'appVersion';
    this.auditLogger.logAccess('getAppVersion');

    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey);
    }

    this.validateVersion(this.appVersion);
    this.configCache.set(cacheKey, this.appVersion);
    return this.appVersion;
  }

  /**
   * Checks if a specific feature is enabled with security validation
   * @param {string} featureName - Name of the feature to check
   * @returns {boolean} True if feature is enabled and validated
   * @throws {Error} If feature name is invalid or not found
   */
  isFeatureEnabled(featureName: string): boolean {
    this.auditLogger.logAccess('isFeatureEnabled', { feature: featureName });

    if (!featureName || typeof featureName !== 'string') {
      throw new Error('Invalid feature name');
    }

    const featureFlags = this.environmentConfig.getFeatureFlags();
    if (!(featureName in featureFlags)) {
      throw new Error(`Feature ${featureName} not found in configuration`);
    }

    const cacheKey = `feature_${featureName}`;
    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey);
    }

    const isEnabled = featureFlags[featureName];
    this.configCache.set(cacheKey, isEnabled);
    return isEnabled;
  }

  /**
   * Returns the validated default application language
   * @returns {string} The default language code
   * @throws {Error} If language configuration is invalid
   */
  getDefaultLanguage(): string {
    this.auditLogger.logAccess('getDefaultLanguage');

    const cacheKey = 'defaultLanguage';
    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey);
    }

    const i18nConfig = this.environmentConfig.getI18nConfig();
    this.validateLanguageCode(i18nConfig.defaultLanguage);
    
    this.configCache.set(cacheKey, i18nConfig.defaultLanguage);
    return i18nConfig.defaultLanguage;
  }

  /**
   * Returns the list of supported languages with validation
   * @returns {string[]} Array of supported language codes
   * @throws {Error} If language configuration is invalid
   */
  getSupportedLanguages(): string[] {
    this.auditLogger.logAccess('getSupportedLanguages');

    const cacheKey = 'supportedLanguages';
    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey);
    }

    const i18nConfig = this.environmentConfig.getI18nConfig();
    if (!i18nConfig.supportedLanguages?.length) {
      throw new Error('No supported languages configured');
    }

    i18nConfig.supportedLanguages.forEach(this.validateLanguageCode);
    this.configCache.set(cacheKey, i18nConfig.supportedLanguages);
    return i18nConfig.supportedLanguages;
  }

  /**
   * Validates and initializes the configuration service
   * @private
   * @throws {Error} If configuration validation fails
   */
  private validateAndInitialize(): void {
    try {
      this.validateAppTitle(this.appTitle);
      this.validateVersion(this.appVersion);
      this.validateFeatureFlags();
      this.validateI18nConfig();
    } catch (error) {
      console.error('Configuration validation failed:', error);
      throw error;
    }
  }

  /**
   * Validates the application title
   * @private
   * @param {string} title - Title to validate
   * @throws {Error} If title is invalid
   */
  private validateAppTitle(title: string): void {
    if (!title || typeof title !== 'string' || title.length < 3) {
      throw new Error('Invalid application title');
    }
  }

  /**
   * Validates the version string format
   * @private
   * @param {string} version - Version to validate
   * @throws {Error} If version format is invalid
   */
  private validateVersion(version: string): void {
    const versionRegex = /^\d+\.\d+\.\d+$/;
    if (!version || !versionRegex.test(version)) {
      throw new Error('Invalid version format');
    }
  }

  /**
   * Validates feature flags configuration
   * @private
   * @throws {Error} If feature flags are invalid
   */
  private validateFeatureFlags(): void {
    const flags = this.environmentConfig.getFeatureFlags();
    const requiredFlags = ['videoInterviews', 'documentOcr', 'multiLanguage'];
    
    for (const flag of requiredFlags) {
      if (typeof flags[flag] !== 'boolean') {
        throw new Error(`Required feature flag missing: ${flag}`);
      }
    }
  }

  /**
   * Validates i18n configuration
   * @private
   * @throws {Error} If i18n configuration is invalid
   */
  private validateI18nConfig(): void {
    const i18nConfig = this.environmentConfig.getI18nConfig();
    if (!i18nConfig.defaultLanguage || !i18nConfig.supportedLanguages?.length) {
      throw new Error('Invalid i18n configuration');
    }
  }

  /**
   * Validates a language code format
   * @private
   * @param {string} code - Language code to validate
   * @throws {Error} If language code is invalid
   */
  private validateLanguageCode(code: string): void {
    const languageRegex = /^[a-z]{2}(-[A-Z]{2})?$/;
    if (!code || !languageRegex.test(code)) {
      throw new Error(`Invalid language code: ${code}`);
    }
  }
}

/**
 * Internal class for configuration access audit logging
 * @private
 */
class ConfigAuditLogger {
  /**
   * Logs configuration access attempts with context
   * @param {string} action - The configuration action being performed
   * @param {object} context - Additional context for the audit log
   */
  logAccess(action: string, context: Record<string, any> = {}): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      action,
      context,
      source: 'AppConfig'
    };
    
    // In production, this would integrate with a proper audit logging system
    if (environment.production) {
      // Send to audit logging service
      console.info('Config Audit:', logEntry);
    }
  }
}