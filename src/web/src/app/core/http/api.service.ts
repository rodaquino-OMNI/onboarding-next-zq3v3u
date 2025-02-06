import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams, HttpEventType } from '@angular/common/http';
import { Observable, throwError, Subject, BehaviorSubject } from 'rxjs';
import { catchError, map, retry, timeout, tap, finalize, takeUntil } from 'rxjs/operators';
import { API_VERSION, API_ENDPOINTS, API_HEADERS, HTTP_STATUS, ERROR_CODES } from '../constants/api.constants';
import { environment } from '../../../environments/environment';

/**
 * Enhanced API Service for handling all HTTP communications
 * Version: 1.0.0
 */
@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly baseUrl: string = environment.apiUrl;
  private readonly defaultHeaders: HttpHeaders;
  private requestCounter: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  private circuitBreaker: Map<string, number> = new Map();
  private cancelationSubjects: Map<string, Subject<void>> = new Map();

  constructor(
    private http: HttpClient,
    private translateService: TranslateService
  ) {
    this.defaultHeaders = new HttpHeaders({
      [API_HEADERS.CONTENT_TYPE]: 'application/json',
      [API_HEADERS.ACCEPT]: 'application/json',
      [API_HEADERS.X_API_VERSION]: API_VERSION,
      [API_HEADERS.X_CLIENT_VERSION]: '1.0.0',
      [API_HEADERS.X_CSRF_TOKEN]: this.getCsrfToken()
    });
  }

  /**
   * Enhanced GET request with caching and retry logic
   */
  public get<T>(endpoint: string, params?: HttpParams, useCache: boolean = false): Observable<T> {
    const requestId = this.generateRequestId();
    const cancelSubject = new Subject<void>();
    this.cancelationSubjects.set(requestId, cancelSubject);

    if (this.isCircuitBroken(endpoint)) {
      return throwError(() => new Error(ERROR_CODES.SERVICE_UNAVAILABLE));
    }

    const headers = this.getRequestHeaders();
    const url = this.buildUrl(endpoint);

    this.incrementRequestCounter();

    return this.http.get<T>(url, {
      headers,
      params,
      observe: 'response'
    }).pipe(
      timeout(environment.apiTimeout || 30000),
      takeUntil(cancelSubject),
      map(response => this.handleResponse<T>(response)),
      retry({
        count: 3,
        delay: this.retryStrategy
      }),
      tap({
        error: (error) => this.updateCircuitBreaker(endpoint, error)
      }),
      catchError(error => this.handleError(error)),
      finalize(() => {
        this.decrementRequestCounter();
        this.cancelationSubjects.delete(requestId);
      })
    );
  }

  /**
   * Enhanced POST request with retry logic
   */
  public post<T>(endpoint: string, data: any, retryEnabled: boolean = true): Observable<T> {
    const requestId = this.generateRequestId();
    const cancelSubject = new Subject<void>();
    this.cancelationSubjects.set(requestId, cancelSubject);

    if (this.isCircuitBroken(endpoint)) {
      return throwError(() => new Error(ERROR_CODES.SERVICE_UNAVAILABLE));
    }

    const headers = this.getRequestHeaders();
    const url = this.buildUrl(endpoint);
    const sanitizedData = this.sanitizeRequestData(data);

    this.incrementRequestCounter();

    return this.http.post<T>(url, sanitizedData, {
      headers,
      observe: 'response'
    }).pipe(
      timeout(environment.apiTimeout || 30000),
      takeUntil(cancelSubject),
      map(response => this.handleResponse<T>(response)),
      retry(retryEnabled ? {
        count: 2,
        delay: this.retryStrategy
      } : 0),
      tap({
        error: (error) => this.updateCircuitBreaker(endpoint, error)
      }),
      catchError(error => this.handleError(error)),
      finalize(() => {
        this.decrementRequestCounter();
        this.cancelationSubjects.delete(requestId);
      })
    );
  }

  /**
   * Enhanced file upload with progress tracking
   */
  public upload<T>(endpoint: string, formData: FormData, progressCallback?: (progress: number) => void): Observable<T> {
    const uploadId = this.generateRequestId();
    const cancelSubject = new Subject<void>();
    this.cancelationSubjects.set(uploadId, cancelSubject);

    const headers = new HttpHeaders({
      [API_HEADERS.X_REQUEST_ID]: uploadId,
      [API_HEADERS.X_API_VERSION]: API_VERSION
    });

    const url = this.buildUrl(endpoint);
    this.incrementRequestCounter();

    return this.http.post<T>(url, formData, {
      headers,
      reportProgress: true,
      observe: 'events'
    }).pipe(
      timeout(environment.aws.s3.expiryTime || 3600000),
      takeUntil(cancelSubject),
      map(event => this.handleUploadEvent(event, progressCallback)),
      retry({
        count: 1,
        delay: this.retryStrategy
      }),
      catchError(error => this.handleError(error)),
      finalize(() => {
        this.decrementRequestCounter();
        this.cancelationSubjects.delete(uploadId);
      })
    );
  }

  /**
   * Cancels an ongoing request
   */
  public cancelRequest(requestId: string): void {
    const cancelSubject = this.cancelationSubjects.get(requestId);
    if (cancelSubject) {
      cancelSubject.next();
      cancelSubject.complete();
      this.cancelationSubjects.delete(requestId);
      this.decrementRequestCounter();
    }
  }

  private getRequestHeaders(): HttpHeaders {
    return this.defaultHeaders.set(
      API_HEADERS.LANGUAGE,
      this.translateService.currentLang || environment.i18n.defaultLanguage
    );
  }

  private buildUrl(endpoint: string): string {
    return `${this.baseUrl}/${endpoint}`.replace(/\/+/g, '/');
  }

  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private handleResponse<T>(response: any): T {
    if (response.headers.get(API_HEADERS.X_RATE_LIMIT_REMAINING)) {
      this.handleRateLimiting(response.headers);
    }
    return response.body;
  }

  private handleUploadEvent(event: any, progressCallback?: (progress: number) => void): any {
    if (event.type === HttpEventType.UploadProgress && progressCallback) {
      const progress = Math.round((100 * event.loaded) / event.total);
      progressCallback(progress);
    }
    return event.type === HttpEventType.Response ? event.body : null;
  }

  private handleError(error: any): Observable<never> {
    const errorResponse = {
      code: error.status || HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: error.error?.message || 'An unexpected error occurred',
      details: error.error?.details || null
    };

    if (error.status === HTTP_STATUS.UNAUTHORIZED) {
      // Handle authentication error
      // Implementation depends on auth service
    }

    return throwError(() => errorResponse);
  }

  private retryStrategy(error: any, retryCount: number): Observable<number> {
    const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
    return new Observable(subscriber => {
      setTimeout(() => {
        subscriber.next(retryCount);
        subscriber.complete();
      }, retryDelay);
    });
  }

  private isCircuitBroken(endpoint: string): boolean {
    const failureCount = this.circuitBreaker.get(endpoint) || 0;
    return failureCount >= 5;
  }

  private updateCircuitBreaker(endpoint: string, error: any): void {
    const currentFailures = this.circuitBreaker.get(endpoint) || 0;
    if (error.status >= 500) {
      this.circuitBreaker.set(endpoint, currentFailures + 1);
      setTimeout(() => this.circuitBreaker.set(endpoint, 0), 30000);
    }
  }

  private handleRateLimiting(headers: HttpHeaders): void {
    const remaining = parseInt(headers.get(API_HEADERS.X_RATE_LIMIT_REMAINING) || '0', 10);
    if (remaining < 10) {
      console.warn('Rate limit threshold approaching');
    }
  }

  private sanitizeRequestData(data: any): any {
    if (!data) return data;
    const sanitized = { ...data };
    // Remove sensitive fields
    delete sanitized.password;
    delete sanitized.token;
    return sanitized;
  }

  private getCsrfToken(): string {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
  }

  private incrementRequestCounter(): void {
    this.requestCounter.next(this.requestCounter.value + 1);
  }

  private decrementRequestCounter(): void {
    this.requestCounter.next(Math.max(0, this.requestCounter.value - 1));
  }
}