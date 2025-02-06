/**
 * @fileoverview Root component of the AUSTA Integration Platform web application
 * Handles core application initialization, theme management, multi-language support,
 * and real-time notifications with WCAG AAA compliance
 * @version 1.0.0
 */

import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core'; // ^15.0.0
import { TranslateService } from '@ngx-translate/core'; // ^14.0.0
import { Subscription, Observable, BehaviorSubject } from 'rxjs'; // ^7.5.0
import { ThemeService } from './core/services/theme.service';
import { NotificationService, Notification } from './core/services/notification.service';
import { Language, Theme } from './core/interfaces/user.interface';
import { APP_CONFIG } from './core/constants/app.constants';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent implements OnInit, OnDestroy {
  // Observables for template binding
  public currentTheme$: Observable<Theme>;
  public unreadNotifications$: Observable<number>;
  public notifications$: Observable<Notification[]>;

  // Language configuration
  private readonly supportedLanguages: Language[] = [Language.Portuguese, Language.English];
  private readonly defaultLanguage: Language = Language.Portuguese;

  // Subscription management
  private subscriptions: Subscription[] = [];

  constructor(
    private translateService: TranslateService,
    private themeService: ThemeService,
    private notificationService: NotificationService
  ) {
    // Initialize observables
    this.currentTheme$ = this.themeService.getCurrentTheme();
    this.unreadNotifications$ = this.notificationService.getUnreadCount();
    this.notifications$ = this.notificationService.getNotifications();
  }

  /**
   * Lifecycle hook for component initialization
   * Sets up language, theme, and notification handling
   */
  public ngOnInit(): void {
    this.initializeLanguage();
    this.setupThemeSubscription();
    this.setupNotifications();
  }

  /**
   * Lifecycle hook for cleanup
   * Unsubscribes from all active subscriptions
   */
  public ngOnDestroy(): void {
    this.subscriptions.forEach(subscription => subscription.unsubscribe());
  }

  /**
   * Initializes application language settings
   * Configures supported languages and sets default language
   * @private
   */
  private initializeLanguage(): void {
    try {
      // Configure language settings
      this.translateService.addLangs(this.supportedLanguages);
      this.translateService.setDefaultLang(this.defaultLanguage);

      // Set initial language
      const browserLang = this.translateService.getBrowserLang();
      const initialLang = this.supportedLanguages.includes(browserLang as Language) 
        ? browserLang 
        : this.defaultLanguage;

      this.translateService.use(initialLang).subscribe({
        error: (error) => {
          console.error('Language initialization failed:', error);
          // Fallback to default language on error
          this.translateService.use(this.defaultLanguage);
        }
      });
    } catch (error) {
      console.error('Language setup failed:', error);
      // Ensure default language is set even if initialization fails
      this.translateService.use(this.defaultLanguage);
    }
  }

  /**
   * Sets up theme subscription with WCAG compliance validation
   * @private
   */
  private setupThemeSubscription(): void {
    try {
      const themeSubscription = this.themeService.getCurrentTheme().subscribe({
        next: (theme: Theme) => {
          // Theme changes are handled by the ThemeService
          // which includes WCAG AAA compliance validation
          document.documentElement.setAttribute('data-theme', theme);
        },
        error: (error) => {
          console.error('Theme subscription error:', error);
          // Fallback to default theme on error
          document.documentElement.setAttribute('data-theme', APP_CONFIG.DEFAULT_THEME);
        }
      });

      this.subscriptions.push(themeSubscription);
    } catch (error) {
      console.error('Theme setup failed:', error);
      // Ensure default theme is set even if setup fails
      document.documentElement.setAttribute('data-theme', APP_CONFIG.DEFAULT_THEME);
    }
  }

  /**
   * Configures real-time notification handling
   * @private
   */
  private setupNotifications(): void {
    try {
      // Set up notification polling with default interval
      const notificationSubscription = this.notificationService.getNotifications().subscribe({
        error: (error) => {
          console.error('Notification subscription error:', error);
        }
      });

      // Track unread notifications
      const unreadSubscription = this.notificationService.getUnreadCount().subscribe({
        error: (error) => {
          console.error('Unread count subscription error:', error);
        }
      });

      this.subscriptions.push(notificationSubscription, unreadSubscription);
    } catch (error) {
      console.error('Notification setup failed:', error);
    }
  }
}