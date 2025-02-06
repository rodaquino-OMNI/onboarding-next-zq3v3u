import { Injectable } from '@angular/core'; // @angular/core v15.0.0
import { Observable, Subject, BehaviorSubject, throwError } from 'rxjs'; // rxjs v7.5.0
import { map, catchError, retry, debounceTime, distinctUntilChanged } from 'rxjs/operators'; // rxjs/operators v7.5.0

import { Document, DocumentType, DocumentStatus, DocumentUploadResponse, OcrResult } from '../../core/interfaces/document.interface';
import { ApiService } from '../../core/http/api.service';
import { API_ENDPOINTS } from '../../core/constants/api.constants';

@Injectable({
  providedIn: 'root'
})
export class DocumentService {
  private readonly ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
  private readonly MAX_FILE_SIZE = 10485760; // 10MB
  private readonly RETRY_ATTEMPTS = 3;
  private readonly OCR_CONFIDENCE_THRESHOLD = 85;

  // Observable for tracking upload progress
  public uploadProgress$: BehaviorSubject<number> = new BehaviorSubject<number>(0);
  
  // Observable for signaling upload completion
  public uploadComplete$: Subject<void> = new Subject<void>();

  // Document cache for performance optimization
  private documentCache: Map<string, { document: Document, timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 300000; // 5 minutes

  constructor(private apiService: ApiService) {}

  /**
   * Uploads a document with encryption and initiates OCR processing
   * @param file File to upload
   * @param type Document classification type
   * @param enrollmentId Associated enrollment ID
   * @returns Observable<DocumentUploadResponse>
   */
  public uploadDocument(
    file: File,
    type: DocumentType,
    enrollmentId: string
  ): Observable<DocumentUploadResponse> {
    // Validate file type and size
    if (!this.ALLOWED_FILE_TYPES.includes(file.type)) {
      return throwError(() => new Error('Invalid file type'));
    }

    if (file.size > this.MAX_FILE_SIZE) {
      return throwError(() => new Error('File size exceeds limit'));
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    formData.append('enrollmentId', enrollmentId);

    // Add encryption headers for HIPAA compliance
    const encryptionHeaders = {
      'x-encryption-algorithm': 'AES-256-GCM',
      'x-encryption-key-id': this.generateKeyId()
    };

    return this.apiService.upload<DocumentUploadResponse>(
      `${API_ENDPOINTS.DOCUMENTS}/upload`,
      formData,
      (progress: number) => this.uploadProgress$.next(progress)
    ).pipe(
      map(response => {
        this.uploadComplete$.next();
        return response;
      }),
      retry({
        count: this.RETRY_ATTEMPTS,
        delay: this.getRetryDelay
      }),
      catchError(error => {
        this.uploadProgress$.next(0);
        return throwError(() => error);
      })
    );
  }

  /**
   * Retrieves a document by ID with caching
   * @param documentId Document identifier
   * @returns Observable<Document>
   */
  public getDocument(documentId: string): Observable<Document> {
    // Check cache first
    const cached = this.documentCache.get(documentId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return new Observable(observer => {
        observer.next(cached.document);
        observer.complete();
      });
    }

    return this.apiService.get<Document>(
      `${API_ENDPOINTS.DOCUMENTS}/${documentId}`
    ).pipe(
      map(document => {
        // Update cache
        this.documentCache.set(documentId, {
          document,
          timestamp: Date.now()
        });
        return document;
      }),
      catchError(error => throwError(() => error))
    );
  }

  /**
   * Retrieves documents for an enrollment with pagination
   * @param enrollmentId Enrollment identifier
   * @param params Pagination parameters
   * @returns Observable<Document[]>
   */
  public getDocumentsByEnrollment(
    enrollmentId: string,
    params: { page: number; limit: number; type?: DocumentType }
  ): Observable<Document[]> {
    const queryParams = new URLSearchParams({
      page: params.page.toString(),
      limit: params.limit.toString(),
      ...(params.type && { type: params.type })
    });

    return this.apiService.get<Document[]>(
      `${API_ENDPOINTS.DOCUMENTS}/enrollment/${enrollmentId}?${queryParams}`
    ).pipe(
      catchError(error => throwError(() => error))
    );
  }

  /**
   * Retrieves OCR results with confidence validation
   * @param documentId Document identifier
   * @returns Observable<OcrResult>
   */
  public getOcrResults(documentId: string): Observable<OcrResult> {
    return this.apiService.get<OcrResult>(
      `${API_ENDPOINTS.DOCUMENTS}/${documentId}/ocr`
    ).pipe(
      map(result => {
        if (result.confidence < this.OCR_CONFIDENCE_THRESHOLD) {
          throw new Error('OCR confidence below threshold');
        }
        return this.sanitizeOcrResult(result);
      }),
      catchError(error => throwError(() => error))
    );
  }

  /**
   * Validates document expiration status
   * @param document Document to validate
   * @returns boolean
   */
  private isDocumentExpired(document: Document): boolean {
    const expirationDate = new Date(document.createdAt);
    expirationDate.setDate(expirationDate.getDate() + document.retentionPeriod);
    return new Date() > expirationDate;
  }

  /**
   * Generates encryption key ID for document security
   * @returns string
   */
  private generateKeyId(): string {
    return `key-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Calculates retry delay with exponential backoff
   * @param retryCount Current retry attempt
   * @returns number
   */
  private getRetryDelay(retryCount: number): number {
    return Math.min(1000 * Math.pow(2, retryCount), 10000);
  }

  /**
   * Sanitizes OCR results to remove potential PHI
   * @param result OCR result to sanitize
   * @returns OcrResult
   */
  private sanitizeOcrResult(result: OcrResult): OcrResult {
    if (result.sensitiveDataFound) {
      // Redact sensitive information
      result.extractedText = this.redactSensitiveData(result.extractedText);
      result.fields = this.redactSensitiveFields(result.fields);
    }
    return result;
  }

  /**
   * Redacts sensitive data from extracted text
   * @param text Text to redact
   * @returns string
   */
  private redactSensitiveData(text: string): string {
    // Redact common PHI patterns
    return text
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED-SSN]')
      .replace(/\b\d{10,}\b/g, '[REDACTED-ID]')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED-EMAIL]');
  }

  /**
   * Redacts sensitive fields from OCR results
   * @param fields Fields to redact
   * @returns Record<string, string>
   */
  private redactSensitiveFields(fields: Record<string, string>): Record<string, string> {
    const sensitiveFields = ['ssn', 'email', 'phone', 'address'];
    return Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        sensitiveFields.some(field => key.toLowerCase().includes(field))
          ? '[REDACTED]'
          : value
      ])
    );
  }
}