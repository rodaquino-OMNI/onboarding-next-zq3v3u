import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core'; // @angular/core v15.0.0
import { TranslateService } from '@ngx-translate/core'; // @ngx-translate/core v14.0.0
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop'; // @angular/cdk/drag-drop v15.0.0
import { A11yModule, LiveAnnouncer } from '@angular/cdk/a11y'; // @angular/cdk/a11y v15.0.0
import { MatProgressBarModule } from '@angular/material/progress-bar'; // @angular/material/progress-bar v15.0.0

import { DocumentService } from '../../../core/services/document.service';
import { Document, DocumentType, DocumentUploadResponse, UploadStatus } from '../../../core/interfaces/document.interface';

@Component({
  selector: 'app-file-upload',
  templateUrl: './file-upload.component.html',
  styleUrls: ['./file-upload.component.scss'],
  providers: [LiveAnnouncer]
})
export class FileUploadComponent implements OnInit, OnDestroy {
  @Input() acceptedTypes: string[] = ['application/pdf', 'image/jpeg', 'image/png'];
  @Input() maxFileSize: number = 10485760; // 10MB
  @Input() enrollmentId!: string;
  @Input() documentType!: DocumentType;

  @Output() uploadComplete = new EventEmitter<Document>();
  @Output() uploadError = new EventEmitter<Error>();
  @Output() uploadCancelled = new EventEmitter<void>();

  uploadProgress: number = 0;
  errorMessage: string = '';
  isDragging: boolean = false;
  isUploading: boolean = false;
  uploadQueue: File[] = [];
  fileProgress: Map<string, number> = new Map();
  isOffline: boolean = false;

  private readonly retryAttempts = 3;
  private readonly offlineStorageKey = 'pendingUploads';
  private networkStatusSubscription: any;

  constructor(
    private documentService: DocumentService,
    private translateService: TranslateService,
    private announcer: LiveAnnouncer
  ) {}

  ngOnInit(): void {
    this.setupNetworkStatusMonitoring();
    this.restorePendingUploads();
  }

  ngOnDestroy(): void {
    if (this.networkStatusSubscription) {
      this.networkStatusSubscription.unsubscribe();
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
    this.announceAccessibility('file.drag.over');
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
    this.announceAccessibility('file.drag.leave');
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    const files = event.dataTransfer?.files;
    if (files) {
      this.handleFileSelection(Array.from(files));
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.handleFileSelection(Array.from(input.files));
    }
  }

  async handleFileSelection(files: File[]): Promise<void> {
    const validFiles = await this.validateFiles(files);
    
    if (validFiles.length === 0) {
      this.announceAccessibility('file.validation.failed');
      return;
    }

    this.uploadQueue.push(...validFiles);
    this.announceAccessibility('file.added.to.queue', { count: validFiles.length });
    
    if (!this.isUploading) {
      this.processUploadQueue();
    }
  }

  async processUploadQueue(): Promise<void> {
    if (this.uploadQueue.length === 0 || this.isUploading) {
      return;
    }

    this.isUploading = true;
    const file = this.uploadQueue[0];

    try {
      await this.uploadFile(file);
      this.uploadQueue.shift();
      
      if (this.uploadQueue.length > 0) {
        this.processUploadQueue();
      } else {
        this.isUploading = false;
      }
    } catch (error) {
      if (!this.isOffline) {
        this.handleUploadError(error as Error);
      } else {
        this.storeForOfflineUpload(file);
      }
      this.isUploading = false;
    }
  }

  private async uploadFile(file: File): Promise<void> {
    this.uploadProgress = 0;
    this.errorMessage = '';

    try {
      const response = await this.documentService.uploadDocument(
        file,
        this.documentType,
        this.enrollmentId
      ).toPromise();

      if (response) {
        this.uploadComplete.emit(response.document);
        this.announceAccessibility('file.upload.success', { filename: file.name });
      }
    } catch (error) {
      throw error;
    }
  }

  private async validateFiles(files: File[]): Promise<File[]> {
    const validFiles: File[] = [];

    for (const file of files) {
      if (!this.acceptedTypes.includes(file.type)) {
        this.showError('file.type.invalid');
        continue;
      }

      if (file.size > this.maxFileSize) {
        this.showError('file.size.exceeded');
        continue;
      }

      try {
        const isValid = await this.documentService.validateDocument(file).toPromise();
        if (isValid) {
          validFiles.push(file);
        }
      } catch (error) {
        this.showError('file.validation.error');
      }
    }

    return validFiles;
  }

  private setupNetworkStatusMonitoring(): void {
    this.isOffline = !navigator.onLine;
    this.networkStatusSubscription = fromEvent(window, 'online').subscribe(() => {
      this.isOffline = false;
      this.processPendingUploads();
    });
    fromEvent(window, 'offline').subscribe(() => {
      this.isOffline = true;
    });
  }

  private async processPendingUploads(): Promise<void> {
    const pendingUploads = this.getPendingUploads();
    if (pendingUploads.length > 0) {
      this.uploadQueue.push(...pendingUploads);
      this.clearPendingUploads();
      this.processUploadQueue();
    }
  }

  private storeForOfflineUpload(file: File): void {
    const pendingUploads = this.getPendingUploads();
    pendingUploads.push(file);
    localStorage.setItem(this.offlineStorageKey, JSON.stringify(pendingUploads));
    this.announceAccessibility('file.stored.offline');
  }

  private getPendingUploads(): File[] {
    const stored = localStorage.getItem(this.offlineStorageKey);
    return stored ? JSON.parse(stored) : [];
  }

  private clearPendingUploads(): void {
    localStorage.removeItem(this.offlineStorageKey);
  }

  private showError(messageKey: string): void {
    this.errorMessage = this.translateService.instant(messageKey);
    this.uploadError.emit(new Error(this.errorMessage));
  }

  private announceAccessibility(messageKey: string, params?: any): void {
    const message = this.translateService.instant(messageKey, params);
    this.announcer.announce(message, 'polite');
  }

  cancelUpload(): void {
    this.uploadQueue = [];
    this.isUploading = false;
    this.uploadProgress = 0;
    this.uploadCancelled.emit();
    this.announceAccessibility('file.upload.cancelled');
  }
}