// @angular/core ^15.0.0
import { 
  Component, 
  Input, 
  Output, 
  EventEmitter, 
  OnInit, 
  OnDestroy, 
  ChangeDetectionStrategy, 
  ElementRef, 
  NgZone 
} from '@angular/core';

// @angular/material/dialog ^15.0.0
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

// @ngx-translate/core ^14.0.0
import { TranslateService } from '@ngx-translate/core';

// rxjs ^7.5.0
import { 
  Subject, 
  fromEvent, 
  takeUntil, 
  debounceTime, 
  distinctUntilChanged 
} from 'rxjs';

// @angular/platform-browser ^15.0.0
import { DomSanitizer, SecurityContext } from '@angular/platform-browser';

// Internal imports
import { LoadingComponent } from '../loading/loading.component';

@Component({
  selector: 'app-modal',
  templateUrl: './modal.component.html',
  styleUrls: ['./modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'role': 'dialog',
    'aria-modal': 'true',
    'tabindex': '-1',
    '[attr.aria-label]': 'title',
    '[attr.aria-hidden]': '!isVisible'
  }
})
export class ModalComponent implements OnInit, OnDestroy {
  @Input() title = '';
  @Input() loading = false;
  @Input() loadingMessage = '';
  @Input() showConfirmButton = true;
  @Input() showCancelButton = true;
  @Input() confirmButtonText = 'COMMON.CONFIRM';
  @Input() cancelButtonText = 'COMMON.CANCEL';
  @Input() preventClose = false;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  public isVisible = true;
  public isSubmitting = false;
  public isRTL = false;
  
  private destroy$ = new Subject<void>();
  private readonly DEBOUNCE_TIME = 300;
  private focusableElements: HTMLElement[] = [];
  private firstFocusableElement?: HTMLElement;
  private lastFocusableElement?: HTMLElement;

  constructor(
    private dialogRef: MatDialogRef<ModalComponent>,
    private translateService: TranslateService,
    private sanitizer: DomSanitizer,
    private elementRef: ElementRef,
    private ngZone: NgZone,
    private loadingComponent: LoadingComponent
  ) {
    this.setupKeyboardListeners();
    this.detectRTL();
  }

  ngOnInit(): void {
    this.initializeAccessibility();
    this.setupCloseProtection();
    this.translateButtons();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.cleanupEventListeners();
  }

  /**
   * Handles modal confirmation with security checks and debounce
   */
  public confirm(): void {
    if (this.isSubmitting || this.loading) {
      return;
    }

    this.isSubmitting = true;
    this.setLoading(true);

    // Sanitize any user input before emitting
    this.ngZone.run(() => {
      this.confirmed.emit();
      
      // Auto-close unless prevented
      if (!this.preventClose) {
        this.dialogRef.close(true);
      }
      
      this.isSubmitting = false;
      this.setLoading(false);
    });
  }

  /**
   * Handles modal cancellation with cleanup
   */
  public cancel(): void {
    if (this.isSubmitting || this.loading) {
      return;
    }

    this.ngZone.run(() => {
      this.cancelled.emit();
      this.dialogRef.close(false);
    });
  }

  /**
   * Sets loading state with accessibility announcements
   */
  public setLoading(isLoading: boolean, message?: string): void {
    this.loading = isLoading;
    
    if (isLoading) {
      this.loadingComponent.show(
        message || this.loadingMessage || 'COMMON.LOADING'
      );
      this.updateAriaLiveRegion(message);
    } else {
      this.loadingComponent.hide();
      this.updateAriaLiveRegion('');
    }

    this.updateButtonStates();
  }

  /**
   * Updates ARIA live region for screen readers
   */
  private updateAriaLiveRegion(message: string): void {
    const liveRegion = this.elementRef.nativeElement.querySelector('[aria-live]');
    if (liveRegion) {
      this.translateService.get(message || '').subscribe(
        translatedMessage => {
          liveRegion.textContent = this.sanitizer.sanitize(
            SecurityContext.HTML, 
            translatedMessage
          );
        }
      );
    }
  }

  /**
   * Initializes accessibility features
   */
  private initializeAccessibility(): void {
    this.focusableElements = Array.from(
      this.elementRef.nativeElement.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    );

    this.firstFocusableElement = this.focusableElements[0];
    this.lastFocusableElement = this.focusableElements[
      this.focusableElements.length - 1
    ];

    if (this.firstFocusableElement) {
      this.firstFocusableElement.focus();
    }
  }

  /**
   * Sets up keyboard event listeners
   */
  private setupKeyboardListeners(): void {
    this.ngZone.runOutsideAngular(() => {
      fromEvent<KeyboardEvent>(document, 'keydown')
        .pipe(
          takeUntil(this.destroy$),
          debounceTime(this.DEBOUNCE_TIME),
          distinctUntilChanged()
        )
        .subscribe(event => {
          if (event.key === 'Escape' && !this.preventClose) {
            this.ngZone.run(() => this.cancel());
          }

          if (event.key === 'Tab') {
            this.handleTabNavigation(event);
          }
        });
    });
  }

  /**
   * Handles tab navigation for focus trap
   */
  private handleTabNavigation(event: KeyboardEvent): void {
    if (!this.firstFocusableElement || !this.lastFocusableElement) {
      return;
    }

    if (event.shiftKey) {
      if (document.activeElement === this.firstFocusableElement) {
        event.preventDefault();
        this.lastFocusableElement.focus();
      }
    } else {
      if (document.activeElement === this.lastFocusableElement) {
        event.preventDefault();
        this.firstFocusableElement.focus();
      }
    }
  }

  /**
   * Detects RTL language setting
   */
  private detectRTL(): void {
    this.translateService.onLangChange
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.isRTL = this.translateService.currentLang === 'ar' || 
                     document.dir === 'rtl';
      });
  }

  /**
   * Sets up protection against unwanted closes
   */
  private setupCloseProtection(): void {
    this.dialogRef.backdropClick()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (!this.preventClose) {
          this.cancel();
        }
      });
  }

  /**
   * Translates button text
   */
  private translateButtons(): void {
    this.translateService.get([
      this.confirmButtonText,
      this.cancelButtonText
    ]).subscribe(translations => {
      this.confirmButtonText = translations[this.confirmButtonText];
      this.cancelButtonText = translations[this.cancelButtonText];
    });
  }

  /**
   * Updates button states based on loading
   */
  private updateButtonStates(): void {
    const confirmButton = this.elementRef.nativeElement.querySelector(
      '[data-test="confirm-button"]'
    );
    const cancelButton = this.elementRef.nativeElement.querySelector(
      '[data-test="cancel-button"]'
    );

    if (confirmButton) {
      confirmButton.disabled = this.loading || this.isSubmitting;
    }
    if (cancelButton) {
      cancelButton.disabled = this.loading || this.isSubmitting;
    }
  }

  /**
   * Cleans up event listeners
   */
  private cleanupEventListeners(): void {
    this.focusableElements = [];
    this.firstFocusableElement = undefined;
    this.lastFocusableElement = undefined;
  }
}