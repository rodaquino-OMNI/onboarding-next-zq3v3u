import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, throwError, of } from 'rxjs';
import { map, catchError, tap, retry, timeout, debounceTime } from 'rxjs/operators';
import { CacheService } from '@angular/common/http';

import { 
  Enrollment, 
  CreateEnrollmentRequest, 
  UpdateEnrollmentRequest, 
  EnrollmentStatus,
  EnrollmentAudit 
} from '../interfaces/enrollment.interface';
import { ApiService } from '../http/api.service';
import { API_ENDPOINTS, ERROR_CODES, HTTP_STATUS } from '../constants/api.constants';

/**
 * Enhanced service for managing healthcare enrollments with HIPAA compliance
 * Version: 1.0.0
 */
@Injectable({
  providedIn: 'root'
})
export class EnrollmentService {
  private readonly apiEndpoint: string = API_ENDPOINTS.ENROLLMENTS;
  private currentEnrollmentSubject: BehaviorSubject<Enrollment | null> = new BehaviorSubject<Enrollment | null>(null);
  public currentEnrollment$: Observable<Enrollment | null> = this.currentEnrollmentSubject.asObservable();
  private enrollmentCache: Map<string, Enrollment> = new Map();
  private readonly REQUEST_TIMEOUT = 5000;
  private readonly MAX_RETRIES = 3;

  constructor(
    private apiService: ApiService,
    private cacheService: CacheService
  ) {}

  /**
   * Creates a new enrollment with enhanced security and validation
   * @param request - Enrollment creation request
   * @returns Observable of created enrollment
   */
  public createEnrollment(request: CreateEnrollmentRequest): Observable<Enrollment> {
    return this.apiService.post<Enrollment>(
      `${this.apiEndpoint}`, 
      request
    ).pipe(
      timeout(this.REQUEST_TIMEOUT),
      retry(this.MAX_RETRIES),
      tap(enrollment => {
        this.currentEnrollmentSubject.next(enrollment);
        this.enrollmentCache.set(enrollment.id, enrollment);
      }),
      catchError(error => {
        if (error.status === HTTP_STATUS.UNPROCESSABLE_ENTITY) {
          return throwError(() => ({
            code: ERROR_CODES.VALIDATION_ERROR,
            message: 'Invalid enrollment data provided'
          }));
        }
        return throwError(() => error);
      })
    );
  }

  /**
   * Retrieves an enrollment by ID with caching
   * @param id - Enrollment ID
   * @returns Observable of enrollment
   */
  public getEnrollment(id: string): Observable<Enrollment> {
    const cached = this.enrollmentCache.get(id);
    if (cached) {
      return of(cached);
    }

    return this.apiService.get<Enrollment>(
      `${this.apiEndpoint}/${id}`
    ).pipe(
      timeout(this.REQUEST_TIMEOUT),
      tap(enrollment => {
        this.enrollmentCache.set(id, enrollment);
        this.currentEnrollmentSubject.next(enrollment);
      }),
      catchError(error => {
        if (error.status === HTTP_STATUS.NOT_FOUND) {
          return throwError(() => ({
            code: ERROR_CODES.RESOURCE_NOT_FOUND,
            message: 'Enrollment not found'
          }));
        }
        return throwError(() => error);
      })
    );
  }

  /**
   * Updates enrollment status with validation
   * @param id - Enrollment ID
   * @param status - New enrollment status
   * @returns Observable of updated enrollment
   */
  public updateEnrollmentStatus(id: string, status: EnrollmentStatus): Observable<Enrollment> {
    const request: UpdateEnrollmentRequest = { status };
    
    return this.apiService.put<Enrollment>(
      `${this.apiEndpoint}/${id}/status`,
      request
    ).pipe(
      timeout(this.REQUEST_TIMEOUT),
      tap(enrollment => {
        this.enrollmentCache.set(id, enrollment);
        this.currentEnrollmentSubject.next(enrollment);
      }),
      catchError(error => {
        if (error.status === HTTP_STATUS.CONFLICT) {
          return throwError(() => ({
            code: ERROR_CODES.RESOURCE_CONFLICT,
            message: 'Invalid status transition'
          }));
        }
        return throwError(() => error);
      })
    );
  }

  /**
   * Calculates detailed enrollment completion progress
   * @param enrollment - Enrollment object
   * @returns Progress percentage
   */
  public getEnrollmentProgress(enrollment: Enrollment): number {
    const weights = {
      documents: 0.3,
      healthRecords: 0.3,
      interview: 0.4
    };

    let progress = 0;

    // Document completion
    if (enrollment.documents.length > 0) {
      const verifiedDocs = enrollment.documents.filter(doc => doc.status === 'VERIFIED').length;
      progress += (verifiedDocs / enrollment.documents.length) * weights.documents;
    }

    // Health records completion
    if (enrollment.healthRecords.length > 0) {
      const verifiedRecords = enrollment.healthRecords.filter(record => record.verified).length;
      progress += (verifiedRecords / enrollment.healthRecords.length) * weights.healthRecords;
    }

    // Interview completion
    if (enrollment.interviews.length > 0) {
      const completedInterviews = enrollment.interviews.filter(interview => 
        interview.status === 'completed'
      ).length;
      progress += (completedInterviews / enrollment.interviews.length) * weights.interview;
    }

    return Math.min(Math.round(progress * 100), 100);
  }

  /**
   * Retrieves enrollment audit trail
   * @param id - Enrollment ID
   * @returns Observable of enrollment audit records
   */
  public getEnrollmentAudit(id: string): Observable<EnrollmentAudit[]> {
    return this.apiService.get<EnrollmentAudit[]>(
      `${this.apiEndpoint}/${id}/audit`
    ).pipe(
      timeout(this.REQUEST_TIMEOUT),
      catchError(error => throwError(() => error))
    );
  }

  /**
   * Clears enrollment cache
   * @param id - Optional enrollment ID to clear specific cache
   */
  public clearCache(id?: string): void {
    if (id) {
      this.enrollmentCache.delete(id);
    } else {
      this.enrollmentCache.clear();
    }
  }

  /**
   * Lists enrollments with pagination and filtering
   * @param page - Page number
   * @param limit - Items per page
   * @param filters - Optional filters
   * @returns Observable of paginated enrollments
   */
  public listEnrollments(
    page: number = 1,
    limit: number = 10,
    filters?: Record<string, any>
  ): Observable<{ data: Enrollment[]; total: number }> {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      ...filters
    });

    return this.apiService.get<{ data: Enrollment[]; total: number }>(
      `${this.apiEndpoint}?${params.toString()}`
    ).pipe(
      timeout(this.REQUEST_TIMEOUT),
      debounceTime(300),
      catchError(error => throwError(() => error))
    );
  }
}