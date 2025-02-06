/**
 * @fileoverview Entry point of the AUSTA Integration Platform web application
 * Bootstraps the Angular application with production mode configuration,
 * platform-specific optimizations, error handling, and performance monitoring
 * @version 1.0.0
 */

import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import * as Sentry from '@sentry/angular';
import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

/**
 * Initializes error tracking service with environment-specific configuration
 */
function initializeErrorTracking(): void {
  if (environment.monitoring.errorTracking.enabled) {
    Sentry.init({
      dsn: environment.monitoring.errorTracking.dsn,
      environment: environment.production ? 'production' : 'development',
      release: environment.APP_VERSION,
      sampleRate: environment.monitoring.errorTracking.sampleRate,
      ignoreErrors: environment.monitoring.errorTracking.ignoreErrors,
      tracesSampleRate: 1.0,
      integrations: [
        new Sentry.BrowserTracing({
          tracingOrigins: ['localhost', environment.apiUrl],
          routingInstrumentation: Sentry.routingInstrumentation
        })
      ]
    });
  }
}

/**
 * Bootstraps the Angular application with comprehensive error handling
 * and performance monitoring
 */
async function bootstrapApplication(): Promise<void> {
  try {
    // Mark bootstrap start time for performance tracking
    const bootstrapStart = performance.now();

    // Enable production mode if environment is production
    if (environment.production) {
      enableProdMode();
    }

    // Initialize error tracking
    initializeErrorTracking();

    // Bootstrap application with platform optimizations
    await platformBrowserDynamic().bootstrapModule(AppModule, {
      // Enable zone.js production mode
      ngZone: 'zone.js',
      // Preserve whitespaces for healthcare form layouts
      preserveWhitespaces: false,
      // Enable JIT compilation in development
      jit: !environment.production
    });

    // Record bootstrap completion time
    const bootstrapEnd = performance.now();
    const bootstrapDuration = bootstrapEnd - bootstrapStart;

    // Log performance metrics if monitoring is enabled
    if (environment.monitoring.enabled) {
      console.info(`Application bootstrap completed in ${bootstrapDuration.toFixed(2)}ms`);
      
      // Report bootstrap performance to monitoring service
      if (environment.monitoring.metrics.enabled) {
        performance.mark('bootstrap-end');
        performance.measure('bootstrap', 'bootstrap-start', 'bootstrap-end');
      }
    }
  } catch (error) {
    handleBootstrapError(error);
  }
}

/**
 * Handles and reports bootstrap errors with proper error tracking
 * @param error Error encountered during bootstrap
 */
function handleBootstrapError(error: Error): void {
  // Capture error with Sentry if enabled
  if (environment.monitoring.errorTracking.enabled) {
    Sentry.captureException(error, {
      tags: {
        phase: 'bootstrap',
        version: environment.APP_VERSION
      }
    });
  }

  // Log error with structured format
  console.error('Application bootstrap failed:', {
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });

  // Report bootstrap failure metrics
  if (environment.monitoring.metrics.enabled) {
    performance.mark('bootstrap-error');
    performance.measure('bootstrap-failure', 'bootstrap-start', 'bootstrap-error');
  }

  // Display user-friendly error message
  const rootElement = document.querySelector('app-root');
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <h1>Application Error</h1>
        <p>We apologize, but the application failed to start. Please try refreshing the page.</p>
      </div>
    `;
  }
}

// Mark bootstrap start for performance tracking
performance.mark('bootstrap-start');

// Bootstrap application when document is ready
if (document.readyState === 'complete') {
  bootstrapApplication();
} else {
  document.addEventListener('DOMContentLoaded', bootstrapApplication);
}