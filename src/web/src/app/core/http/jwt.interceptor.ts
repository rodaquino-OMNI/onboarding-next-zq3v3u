import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, switchMap, filter, take, finalize } from 'rxjs/operators';

import { AuthService } from '../auth/auth.service';
import { API_HEADERS } from '../constants/api.constants';

/**
 * JWT Interceptor implementing zero-trust security principles
 * Version: 1.0.0
 * 
 * Handles secure token management, validation, and refresh for all HTTP requests
 * Implements thread-safe token refresh with request queueing
 */
@Injectable()
export class JwtInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<string | null> = new BehaviorSubject<string | null>(null);
  private readonly maxRetryAttempts = 3;
  private blacklistedTokens: Set<string> = new Set();

  constructor(private authService: AuthService) {}

  /**
   * Intercepts HTTP requests to implement zero-trust token validation and refresh
   * @param request The outgoing HTTP request
   * @param next The HTTP handler for the request chain
   * @returns An observable of the HTTP event stream
   */
  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Skip token handling for authentication endpoints
    if (this.isAuthEndpoint(request.url)) {
      return next.handle(request);
    }

    const token = this.authService.getToken();

    // Add token if available and valid
    if (token && !this.blacklistedTokens.has(token)) {
      request = this.addToken(request, token);
    }

    return next.handle(request).pipe(
      catchError(error => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          // Handle 401 errors with token refresh
          if (error.error?.code === 'ERR_TOKEN_EXPIRED') {
            return this.handle401Error(request, next);
          }
          
          // Handle other authentication errors
          return this.handleAuthError(error);
        }
        
        return throwError(() => error);
      })
    );
  }

  /**
   * Handles 401 errors with thread-safe token refresh
   * @param request The failed HTTP request
   * @param next The HTTP handler
   * @returns An observable of the HTTP event stream
   */
  private handle401Error(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      return this.authService.refreshToken().pipe(
        switchMap(response => {
          this.isRefreshing = false;
          this.refreshTokenSubject.next(response.token);
          return next.handle(this.addToken(request, response.token));
        }),
        catchError(error => {
          this.isRefreshing = false;
          return this.handleRefreshError(error);
        })
      );
    }

    // Queue requests while token is being refreshed
    return this.refreshTokenSubject.pipe(
      filter(token => token !== null),
      take(1),
      switchMap(token => next.handle(this.addToken(request, token!))),
      catchError(error => this.handleAuthError(error))
    );
  }

  /**
   * Adds validated JWT token to request headers
   * @param request The HTTP request
   * @param token The JWT token
   * @returns A cloned request with the token header
   */
  private addToken(request: HttpRequest<any>, token: string): HttpRequest<any> {
    // Validate token format
    if (!this.isValidTokenFormat(token)) {
      throw new Error('Invalid token format');
    }

    return request.clone({
      headers: request.headers
        .set(API_HEADERS.AUTHORIZATION, `Bearer ${token}`)
        .set(API_HEADERS.X_REQUEST_ID, this.generateRequestId())
    });
  }

  /**
   * Handles authentication errors with security logging
   * @param error The HTTP error response
   * @returns An error observable
   */
  private handleAuthError(error: HttpErrorResponse): Observable<never> {
    // Add invalid token to blacklist
    const token = this.authService.getToken();
    if (token) {
      this.blacklistedTokens.add(token);
    }

    // Log security event
    console.error('Authentication error:', {
      code: error.error?.code,
      status: error.status,
      timestamp: new Date().toISOString()
    });

    return throwError(() => error);
  }

  /**
   * Handles token refresh errors
   * @param error The refresh error
   * @returns An error observable
   */
  private handleRefreshError(error: any): Observable<never> {
    this.refreshTokenSubject.next(null);
    
    // Clear invalid refresh token
    const token = this.authService.getToken();
    if (token) {
      this.blacklistedTokens.add(token);
    }

    return throwError(() => error);
  }

  /**
   * Validates JWT token format
   * @param token The JWT token to validate
   * @returns Boolean indicating if token format is valid
   */
  private isValidTokenFormat(token: string): boolean {
    const tokenRegex = /^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/;
    return tokenRegex.test(token);
  }

  /**
   * Checks if request is for authentication endpoints
   * @param url The request URL
   * @returns Boolean indicating if URL is an auth endpoint
   */
  private isAuthEndpoint(url: string): boolean {
    const authEndpoints = [
      '/auth/login',
      '/auth/refresh',
      '/auth/logout',
      '/auth/mfa'
    ];
    return authEndpoints.some(endpoint => url.includes(endpoint));
  }

  /**
   * Generates unique request ID for tracing
   * @returns Unique request identifier
   */
  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}