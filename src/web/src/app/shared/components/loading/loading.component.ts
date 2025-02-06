import { Component, OnInit, OnDestroy } from '@angular/core'; // @angular/core ^15.0.0
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'; // @angular/material/progress-spinner ^15.0.0
import { TranslateService } from '@ngx-translate/core'; // @ngx-translate/core ^14.0.0
import { Subject } from 'rxjs'; // rxjs ^7.0.0

interface LoadingHistoryEntry {
  timestamp: Date;
  action: 'show' | 'hide';
  message?: string;
  timeout?: number;
}

@Component({
  selector: 'app-loading',
  templateUrl: './loading.component.html',
  styleUrls: ['./loading.component.scss'],
  host: {
    'role': 'alert',
    'aria-live': 'polite',
    'aria-busy': 'true',
    'aria-atomic': 'true'
  }
})
export class LoadingComponent implements OnInit, OnDestroy {
  // Public properties for state management
  public isVisible = false;
  public message = '';
  
  // Private properties for internal state tracking
  private loadingCount = 0;
  private destroy$ = new Subject<void>();
  private loadingTimeout?: number;
  private loadingHistory: LoadingHistoryEntry[] = [];
  private readonly DEFAULT_TIMEOUT = 30000; // 30 seconds default timeout
  private readonly MAX_HISTORY_ENTRIES = 100;

  constructor(private translateService: TranslateService) {
    this.setDefaultMessage();
  }

  ngOnInit(): void {
    // Initialize with default translated message
    this.setDefaultMessage();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.clearTimeout();
    this.resetState();
  }

  /**
   * Shows the loading indicator with optional custom message and timeout
   * @param customMessage Optional custom message to display
   * @param timeout Optional timeout in milliseconds
   */
  public show(customMessage?: string, timeout: number = this.DEFAULT_TIMEOUT): void {
    this.loadingCount++;
    this.isVisible = true;
    
    // Update ARIA attributes
    this.updateAriaAttributes(true);

    // Set message with translation if provided
    if (customMessage) {
      this.translateService.get(customMessage).subscribe(
        (translatedMessage: string) => {
          this.message = translatedMessage;
        }
      );
    } else {
      this.setDefaultMessage();
    }

    // Set timeout for safety
    this.setLoadingTimeout(timeout);

    // Log to history
    this.addToHistory('show', customMessage, timeout);
  }

  /**
   * Hides the loading indicator
   */
  public hide(): void {
    if (this.loadingCount > 0) {
      this.loadingCount--;
    }

    if (this.loadingCount === 0) {
      this.isVisible = false;
      this.setDefaultMessage();
      this.clearTimeout();
      this.updateAriaAttributes(false);
      this.addToHistory('hide');
    }
  }

  /**
   * Forces hide of loading indicator regardless of count
   */
  public forceHide(): void {
    this.loadingCount = 0;
    this.isVisible = false;
    this.setDefaultMessage();
    this.clearTimeout();
    this.updateAriaAttributes(false);
    this.addToHistory('hide');
  }

  /**
   * Returns current loading state
   */
  public isLoading(): boolean {
    return this.isVisible;
  }

  /**
   * Sets the default loading message using translation service
   */
  private setDefaultMessage(): void {
    this.translateService.get('COMMON.LOADING').subscribe(
      (defaultMessage: string) => {
        this.message = defaultMessage;
      }
    );
  }

  /**
   * Updates ARIA attributes based on loading state
   */
  private updateAriaAttributes(isLoading: boolean): void {
    const element = document.querySelector('app-loading');
    if (element) {
      element.setAttribute('aria-busy', isLoading.toString());
    }
  }

  /**
   * Sets a timeout to automatically hide the loading indicator
   */
  private setLoadingTimeout(timeout: number): void {
    this.clearTimeout();
    if (timeout > 0) {
      this.loadingTimeout = window.setTimeout(() => {
        console.warn('Loading indicator timeout reached');
        this.forceHide();
      }, timeout);
    }
  }

  /**
   * Clears any active loading timeout
   */
  private clearTimeout(): void {
    if (this.loadingTimeout) {
      window.clearTimeout(this.loadingTimeout);
      this.loadingTimeout = undefined;
    }
  }

  /**
   * Resets component state
   */
  private resetState(): void {
    this.loadingCount = 0;
    this.isVisible = false;
    this.message = '';
    this.loadingHistory = [];
  }

  /**
   * Adds an entry to the loading history
   */
  private addToHistory(action: 'show' | 'hide', message?: string, timeout?: number): void {
    this.loadingHistory.push({
      timestamp: new Date(),
      action,
      message,
      timeout
    });

    // Maintain history size
    if (this.loadingHistory.length > this.MAX_HISTORY_ENTRIES) {
      this.loadingHistory.shift();
    }
  }

  /**
   * Gets the loading history for debugging purposes
   */
  public getLoadingHistory(): LoadingHistoryEntry[] {
    return [...this.loadingHistory];
  }
}