import { 
  Component, 
  OnInit, 
  OnDestroy, 
  ChangeDetectionStrategy, 
  ChangeDetectorRef 
} from '@angular/core';
import { Observable, Subject, Subscription } from 'rxjs';
import { catchError, retry, takeUntil } from 'rxjs/operators';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatMenuModule } from '@angular/material/menu';

import { ThemeService } from '../../../core/services/theme.service';
import { NotificationService } from '../../../core/services/notification.service';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageSelectorComponent } from '../language-selector/language-selector.component';

/**
 * Global header component implementing navigation, theme switching,
 * notifications, and user profile management with WCAG AAA compliance
 * @version 1.0.0
 */
@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'role': 'banner',
    'aria-label': 'Global header navigation'
  }
})
export class HeaderComponent implements OnInit, OnDestroy {
  // Public observables
  public currentTheme$: Observable<'light' | 'dark'>;
  public unreadNotifications$: Observable<number>;
  public isAuthenticated$: Observable<boolean>;

  // State management
  public isLoading = false;
  public error: string | null = null;

  // Cleanup subscriptions
  private destroy$ = new Subject<void>();
  private subscriptions = new Subscription();

  constructor(
    private readonly themeService: ThemeService,
    private readonly notificationService: NotificationService,
    private readonly authService: AuthService,
    private readonly cdr: ChangeDetectorRef
  ) {
    // Initialize observables
    this.currentTheme$ = this.themeService.getCurrentTheme();
    this.unreadNotifications$ = this.notificationService.getUnreadCount();
    this.isAuthenticated$ = this.authService.isAuthenticated$;
  }

  /**
   * Initialize component with error handling and accessibility setup
   */
  public ngOnInit(): void {
    // Set up notification polling with retry logic
    this.subscriptions.add(
      this.notificationService.getNotifications()
        .pipe(
          retry(3),
          takeUntil(this.destroy$),
          catchError(error => {
            this.handleError(error);
            return [];
          })
        )
        .subscribe()
    );

    // Initialize theme with system preference detection
    this.subscriptions.add(
      this.currentTheme$
        .pipe(takeUntil(this.destroy$))
        .subscribe(theme => {
          // Update ARIA labels for theme state
          const themeButton = document.querySelector('#theme-toggle');
          if (themeButton) {
            themeButton.setAttribute('aria-label', 
              `Switch to ${theme === 'light' ? 'dark' : 'light'} theme`
            );
          }
        })
    );

    // Set up keyboard navigation
    this.setupKeyboardNavigation();
  }

  /**
   * Clean up subscriptions and event listeners
   */
  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.subscriptions.unsubscribe();
  }

  /**
   * Toggle theme with accessibility announcements
   */
  public toggleTheme(): void {
    try {
      this.themeService.toggleTheme();
      
      // Announce theme change to screen readers
      const message = document.createElement('div');
      message.setAttribute('aria-live', 'polite');
      message.textContent = 'Theme changed successfully';
      document.body.appendChild(message);
      
      setTimeout(() => message.remove(), 3000);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Handle secure logout with cleanup
   */
  public logout(): void {
    this.isLoading = true;
    
    this.authService.logout()
      .pipe(
        takeUntil(this.destroy$),
        catchError(error => {
          this.handleError(error);
          return [];
        })
      )
      .subscribe({
        complete: () => {
          // Announce logout to screen readers
          const message = document.createElement('div');
          message.setAttribute('aria-live', 'assertive');
          message.textContent = 'Successfully logged out';
          document.body.appendChild(message);
          
          setTimeout(() => {
            message.remove();
            this.isLoading = false;
            this.cdr.detectChanges();
          }, 3000);
        }
      });
  }

  /**
   * Set up keyboard navigation handlers
   */
  private setupKeyboardNavigation(): void {
    document.addEventListener('keydown', (event: KeyboardEvent) => {
      // Skip to main content
      if (event.key === '/' && event.ctrlKey) {
        event.preventDefault();
        const mainContent = document.querySelector('main');
        if (mainContent) {
          (mainContent as HTMLElement).focus();
        }
      }
    });
  }

  /**
   * Handle errors with user feedback
   */
  private handleError(error: any): void {
    console.error('Header component error:', error);
    this.error = error.message || 'An unexpected error occurred';
    this.isLoading = false;
    
    // Show error message to screen readers
    const message = document.createElement('div');
    message.setAttribute('aria-live', 'assertive');
    message.textContent = this.error;
    document.body.appendChild(message);
    
    setTimeout(() => {
      message.remove();
      this.error = null;
      this.cdr.detectChanges();
    }, 5000);
  }
}