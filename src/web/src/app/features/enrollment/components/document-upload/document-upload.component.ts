import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core'; // @angular/core v15.0.0
import { TranslateService } from '@ngx-translate/core'; // @ngx-translate/core v14.0.0
import { Observable, Subject } from 'rxjs'; // rxjs v7.5.0
import { takeUntil, catchError, retry } from 'rxjs/operators'; // rxjs v7.5.0

import { 
  Document, 
  DocumentType, 
  DocumentStatus, 
  OcrResult, 
  DocumentAudit 
} from '../../../../core/interfaces/document.interface';
import { DocumentService } from '../../../../core/services/document.service';
import { ERROR_CODES } from '../../../../core/constants/api.constants';

@Component({
  selector: 'app-document-upload',
  templateUrl: './document-upload.component.html',
  styleUrls: ['./document-upload.component.scss']
})
export class DocumentUploadComponent implements OnInit, OnDestroy {
  @Input() enrollmentId!: string;
  @Output() documentProcessed = new EventEmitter<Document>();
  @Output() documentAudited = new EventEmitter<DocumentAudit>();

  // Document management
  documents: Document[] = [];
  requiredDocuments: DocumentType[] = [
    DocumentType.ID_DOCUMENT,
    DocumentType.PROOF_OF_ADDRESS,
    DocumentType.HEALTH_DECLARATION
  ];

  // Processing states
  isProcessing = false;
  uploadProgress = 0;
  errorMessage = '';
  isEncrypted = true;

  // File validation
  private readonly ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
  private readonly MAX_FILE_SIZE = 10485760; // 10MB
  private readonly OCR_CONFIDENCE_THRESHOLD = 85;

  // Retry configurations
  private retryConfigs = new Map<string, { attempts: number; delay: number }>([
    ['upload', { attempts: 3, delay: 1000 }],
    ['ocr', { attempts: 2, delay: 2000 }]
  ]);

  private destroy$ = new Subject<void>();

  constructor(
    private documentService: DocumentService,
    private translateService: TranslateService
  ) {}

  ngOnInit(): void {
    this.loadExistingDocuments();
    this.setupSecurityConfig();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Handles secure document upload with encryption and validation
   */
  async onFileSelected(event: Event, documentType: DocumentType): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      this.validateFile(file);
      this.isProcessing = true;
      this.errorMessage = '';

      const uploadResponse = await this.uploadDocument(file, documentType);
      if (uploadResponse) {
        await this.processDocument(uploadResponse);
      }
    } catch (error: any) {
      this.handleError(error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Validates file against security requirements
   */
  private validateFile(file: File): void {
    if (!this.ALLOWED_FILE_TYPES.includes(file.type)) {
      throw new Error(ERROR_CODES.INVALID_DOCUMENT);
    }

    if (file.size > this.MAX_FILE_SIZE) {
      throw new Error(ERROR_CODES.DOCUMENT_TOO_LARGE);
    }
  }

  /**
   * Uploads document with encryption and security headers
   */
  private uploadDocument(file: File, type: DocumentType): Promise<Document> {
    return new Promise((resolve, reject) => {
      this.documentService.uploadDocument(file, type, this.enrollmentId)
        .pipe(
          retry(this.retryConfigs.get('upload')!),
          takeUntil(this.destroy$)
        )
        .subscribe({
          next: (response) => {
            this.uploadProgress = 100;
            resolve(response.document);
          },
          error: (error) => reject(error)
        });
    });
  }

  /**
   * Processes document with OCR and PHI detection
   */
  private async processDocument(document: Document): Promise<void> {
    try {
      const ocrResult = await this.getOcrResults(document.id);
      
      if (ocrResult.confidence < this.OCR_CONFIDENCE_THRESHOLD) {
        throw new Error(ERROR_CODES.DOCUMENT_PROCESSING_FAILED);
      }

      if (ocrResult.sensitiveDataFound) {
        this.auditSensitiveDataAccess(document.id);
      }

      document.status = DocumentStatus.PROCESSED;
      document.ocrData = ocrResult;
      
      this.documents.push(document);
      this.documentProcessed.emit(document);
    } catch (error) {
      throw new Error(ERROR_CODES.DOCUMENT_PROCESSING_FAILED);
    }
  }

  /**
   * Retrieves OCR results with retry logic
   */
  private getOcrResults(documentId: string): Promise<OcrResult> {
    return new Promise((resolve, reject) => {
      this.documentService.getOcrResults(documentId)
        .pipe(
          retry(this.retryConfigs.get('ocr')!),
          takeUntil(this.destroy$)
        )
        .subscribe({
          next: (result) => resolve(result),
          error: (error) => reject(error)
        });
    });
  }

  /**
   * Loads existing documents for the enrollment
   */
  private loadExistingDocuments(): void {
    this.documentService.getDocumentsByEnrollment(this.enrollmentId, {
      page: 1,
      limit: 10
    })
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (documents) => this.documents = documents,
      error: (error) => this.handleError(error)
    });
  }

  /**
   * Sets up security configuration for document handling
   */
  private setupSecurityConfig(): void {
    this.isEncrypted = true; // Always enforce encryption
    this.documentService.uploadProgress$
      .pipe(takeUntil(this.destroy$))
      .subscribe(progress => this.uploadProgress = progress);
  }

  /**
   * Audits sensitive data access for HIPAA compliance
   */
  private auditSensitiveDataAccess(documentId: string): void {
    const auditEvent: DocumentAudit = {
      documentId,
      enrollmentId: this.enrollmentId,
      action: 'PHI_ACCESS',
      timestamp: new Date(),
      userId: 'current-user-id' // Should be retrieved from auth service
    };
    this.documentAudited.emit(auditEvent);
  }

  /**
   * Handles errors with user-friendly messages
   */
  private handleError(error: any): void {
    this.isProcessing = false;
    this.uploadProgress = 0;
    
    const errorCode = error.message || ERROR_CODES.DOCUMENT_UPLOAD_FAILED;
    this.errorMessage = this.translateService.instant(`errors.${errorCode}`);
    
    console.error('Document processing error:', error);
  }

  /**
   * Checks if all required documents are uploaded
   */
  isDocumentComplete(): boolean {
    return this.requiredDocuments.every(type =>
      this.documents.some(doc => doc.type === type && doc.status === DocumentStatus.PROCESSED)
    );
  }
}