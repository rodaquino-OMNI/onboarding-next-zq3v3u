import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, of, timer } from 'rxjs';
import { catchError, switchMap, retryWhen, mergeMap } from 'rxjs/operators';

import { AuthService } from './auth.service';
import { API_HEADERS, HTTP_STATUS, ERROR_CODES } from '../constants/api.constants';

/**
 * HTTP interceptor that handles authentication token management and request security
 * Version: 1.0.0
 */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private retryCount = 0;
  private readonly maxRetries = 3;
  private readonly backoffInterval = 1000;
  private isRefreshing = false;
  private refreshTokenSubject: any = null;
  private readonly circuitBreaker = {
    failures: 0,
    lastFailure: 0,
    threshold: 5,
    resetTimeout: 30000
  };

  constructor(private authService: AuthService) {}

  /**
   * Intercepts HTTP requests to add authentication and language headers
   * Implements zero-trust security principles and circuit breaker pattern
   */
  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Check circuit breaker status
    if (this.isCircuitBroken()) {
      return throwError(() => new Error(ERROR_CODES.SERVICE_UNAVAILABLE));
    }

    // Add authentication and language headers
    request = this.addSecurityHeaders(request);

    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        return this.handleRequestError(error, request, next);
      }),
      retryWhen(errors => 
        errors.pipe(
          mergeMap((error, index) => {
            this.retryCount = index + 1;
            
            // Don't retry on authentication errors or after max retries
            if (error.status === HTTP_STATUS.UNAUTHORIZED || this.retryCount >= this.maxRetries) {
              return throwError(() => error);
            }

            // Implement exponential backoff
            const backoffTime = this.backoffInterval * Math.pow(2, this.retryCount);
            return timer(Math.min(backoffTime, 10000));
          })
        )
      )
    );
  }

  /**
   * Adds security headers to the request including authentication token
   * and language preferences with fallback support
   */
  private addSecurityHeaders(request: HttpRequest<any>): HttpRequest<any> {
    const token = this.authService.getToken();
    const headers: any = {};

    if (token && !this.authService.isTokenExpired()) {
      headers[API_HEADERS.AUTHORIZATION] = `Bearer ${token}`;
    }

    // Add language headers with fallback
    headers[API_HEADERS.LANGUAGE] = navigator.language || 'pt-BR';

    // Add security headers
    headers[API_HEADERS.X_REQUEST_ID] = this.generateRequestId();
    headers[API_HEADERS.X_CLIENT_VERSION] = '1.0.0';

    return request.clone({ setHeaders: headers });
  }

  /**
   * Handles HTTP request errors with comprehensive error handling
   * and token refresh logic
   */
  private handleRequestError(
    error: HttpErrorResponse,
    request: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    // Update circuit breaker on server errors
    if (error.status >= 500) {
      this.updateCircuitBreaker();
    }

    // Handle 401 Unauthorized errors
    if (error.status === HTTP_STATUS.UNAUTHORIZED) {
      return this.handle401Error(request, next);
    }

    // Handle other errors
    return throwError(() => ({
      code: error.status,
      message: error.error?.message || 'An error occurred',
      details: error.error?.details
    }));
  }

  /**
   * Handles 401 Unauthorized errors with token refresh logic
   * Implements queueing mechanism to prevent multiple refresh attempts
   */
  private handle401Error(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject = null;

      return this.authService.refreshToken().pipe(
        switchMap(response => {
          this.isRefreshing = false;
          this.refreshTokenSubject = response.token;
          
          // Retry the original request with new token
          return next.handle(this.addSecurityHeaders(request));
        }),
        catchError(error => {
          this.isRefreshing = false;
          this.authService.logout();
          return throwError(() => error);
        })
      );
    }

    // Queue requests while token is being refreshed
    return this.waitForTokenRefresh(request, next);
  }

  /**
   * Implements request queueing while token refresh is in progress
   */
  private waitForTokenRefresh(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return new Observable(observer => {
      const subscription = this.refreshTokenSubject.subscribe(
        (token: string) => {
          observer.next(next.handle(this.addSecurityHeaders(request)));
          observer.complete();
        },
        (error: any) => {
          observer.error(error);
        }
      );

      return () => {
        subscription.unsubscribe();
      };
    });
  }

  /**
   * Generates a unique request ID for tracing
   */
  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Updates circuit breaker state on failures
   */
  private updateCircuitBreaker(): void {
    const now = Date.now();
    
    if (now - this.circuitBreaker.lastFailure > this.circuitBreaker.resetTimeout) {
      this.circuitBreaker.failures = 0;
    }
    
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = now;
  }

  /**
   * Checks if circuit breaker is triggered
   */
  private isCircuitBroken(): boolean {
    const now = Date.now();
    
    if (now - this.circuitBreaker.lastFailure > this.circuitBreaker.resetTimeout) {
      this.circuitBreaker.failures = 0;
      return false;
    }
    
    return this.circuitBreaker.failures >= this.circuitBreaker.threshold;
  }
}