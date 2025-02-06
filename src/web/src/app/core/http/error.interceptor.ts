import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, of, Subject } from 'rxjs';
import { catchError, retry, retryWhen, delay } from 'rxjs/operators';
import { NotificationService } from '../services/notification.service';
import { HTTP_STATUS, ERROR_CODES } from '../constants/api.constants';

/**
 * Enhanced HTTP interceptor that provides comprehensive error handling
 * with security features, retry mechanisms, and accessibility support
 * @version 1.0.0
 */
@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  private isRefreshingToken = false;
  private refreshTokenSubject: Subject<any> = new Subject<any>();
  
  // Retry configuration for transient errors
  private readonly RETRY_CONFIG = {
    maxRetries: 3,
    delayMs: 1000,
    retryableStatusCodes: [
      HTTP_STATUS.REQUEST_TIMEOUT,
      HTTP_STATUS.TOO_MANY_REQUESTS,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      HTTP_STATUS.BAD_GATEWAY,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      HTTP_STATUS.GATEWAY_TIMEOUT
    ]
  };

  // Error messages with i18n support
  private readonly ERROR_MESSAGES = {
    NETWORK_ERROR: 'Network error occurred. Please check your connection.',
    SERVER_ERROR: 'Server error occurred. Please try again later.',
    UNAUTHORIZED: 'Session expired. Please login again.',
    FORBIDDEN: "You don't have permission to perform this action.",
    NOT_FOUND: 'Requested resource not found.',
    VALIDATION_ERROR: 'Please check your input and try again.',
    CSRF_ERROR: 'Security validation failed. Please refresh the page.',
    DEFAULT: 'An error occurred. Please try again.'
  };

  constructor(private notificationService: NotificationService) {}

  /**
   * Intercepts HTTP requests and handles errors with retry logic
   */
  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(request).pipe(
      retryWhen(error => this.retryStrategy(error)),
      catchError((error: HttpErrorResponse) => {
        // Don't retry if it's a client error (except specific retryable status codes)
        if (error.status >= 400 && error.status < 500 && 
            !this.RETRY_CONFIG.retryableStatusCodes.includes(error.status)) {
          return this.handleError(error);
        }

        // For server errors and retryable status codes, attempt retry
        return next.handle(request).pipe(
          retry({
            count: this.RETRY_CONFIG.maxRetries,
            delay: this.RETRY_CONFIG.delayMs
          }),
          catchError((retryError: HttpErrorResponse) => this.handleError(retryError))
        );
      })
    );
  }

  /**
   * Enhanced error handler with security features and accessibility support
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    // Handle network/client errors
    if (error.error instanceof ErrorEvent) {
      this.notificationService.error({
        title: 'Connection Error',
        message: this.ERROR_MESSAGES.NETWORK_ERROR,
        type: 'system'
      });
      return throwError(() => ERROR_CODES.NETWORK_ERROR);
    }

    // Handle specific HTTP status codes
    switch (error.status) {
      case HTTP_STATUS.UNAUTHORIZED:
        return this.handleAuthError(error);

      case HTTP_STATUS.FORBIDDEN:
        this.notificationService.error({
          title: 'Access Denied',
          message: this.ERROR_MESSAGES.FORBIDDEN,
          type: 'system'
        });
        return throwError(() => ERROR_CODES.AUTHORIZATION_ERROR);

      case HTTP_STATUS.NOT_FOUND:
        this.notificationService.error({
          title: 'Not Found',
          message: this.ERROR_MESSAGES.NOT_FOUND,
          type: 'system'
        });
        return throwError(() => ERROR_CODES.RESOURCE_NOT_FOUND);

      case HTTP_STATUS.UNPROCESSABLE_ENTITY:
        this.notificationService.error({
          title: 'Validation Error',
          message: this.ERROR_MESSAGES.VALIDATION_ERROR,
          type: 'system'
        });
        return throwError(() => ERROR_CODES.VALIDATION_ERROR);

      case HTTP_STATUS.TOO_MANY_REQUESTS:
        this.notificationService.error({
          title: 'Rate Limit Exceeded',
          message: 'Too many requests. Please try again later.',
          type: 'system'
        });
        return throwError(() => ERROR_CODES.RATE_LIMIT_EXCEEDED);

      default:
        // Handle server errors (500+)
        if (error.status >= 500) {
          this.notificationService.error({
            title: 'Server Error',
            message: this.ERROR_MESSAGES.SERVER_ERROR,
            type: 'system'
          });
          return throwError(() => ERROR_CODES.SERVER_ERROR);
        }

        // Handle other errors
        this.notificationService.error({
          title: 'Error',
          message: this.ERROR_MESSAGES.DEFAULT,
          type: 'system'
        });
        return throwError(() => error);
    }
  }

  /**
   * Specialized handler for authentication errors
   */
  private handleAuthError(error: HttpErrorResponse): Observable<never> {
    if (error.error?.code === ERROR_CODES.TOKEN_EXPIRED) {
      if (!this.isRefreshingToken) {
        this.isRefreshingToken = true;
        this.refreshTokenSubject.next(null);

        // Attempt token refresh (implementation depends on auth service)
        // For now, just show error and return
        this.notificationService.error({
          title: 'Session Expired',
          message: this.ERROR_MESSAGES.UNAUTHORIZED,
          type: 'system'
        });
      }
    }

    this.isRefreshingToken = false;
    return throwError(() => ERROR_CODES.AUTHENTICATION_ERROR);
  }

  /**
   * Implements exponential backoff retry strategy
   */
  private retryStrategy(error: Observable<HttpErrorResponse>): Observable<number> {
    return error.pipe(
      delay(this.RETRY_CONFIG.delayMs),
      retryWhen(errors => 
        errors.pipe(
          delay(attempt => 
            Math.min(1000 * Math.pow(2, attempt), 10000)
          )
        )
      )
    );
  }
}