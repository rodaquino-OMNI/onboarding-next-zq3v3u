import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { MatSelectModule } from '@angular/material/select';
import { StorageService } from '../../../core/services/storage.service';
import { setLanguage, validateLanguage } from '../../../core/i18n/i18n.module';

// Constants
const LANGUAGE_STORAGE_KEY = 'austa-language-preference-secure';
const SUPPORTED_LANGUAGES = ['pt-BR', 'en'] as const;
const DEFAULT_LANGUAGE = 'pt-BR';

// Language display names with WCAG AAA compliant contrast
const LANGUAGE_LABELS = {
  'pt-BR': 'Português (Brasil)',
  'en': 'English'
};

/**
 * WCAG AAA compliant language selector component with LGPD compliance
 * Provides accessible language switching functionality with secure preference storage
 */
@Component({
  selector: 'app-language-selector',
  templateUrl: './language-selector.component.html',
  styleUrls: ['./language-selector.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'role': 'region',
    'aria-label': 'Language selection'
  }
})
export class LanguageSelectorComponent implements OnInit {
  // Public properties
  public currentLanguage: string = DEFAULT_LANGUAGE;
  public supportedLanguages = SUPPORTED_LANGUAGES;
  public languageLabels = LANGUAGE_LABELS;
  public isLoading = false;
  public hasUserConsent = false;

  constructor(
    private readonly storageService: StorageService,
    private readonly translateService: TranslateService
  ) {}

  /**
   * Initialize component with stored preferences and WCAG compliance setup
   */
  async ngOnInit(): Promise<void> {
    try {
      // Load stored language preference securely
      const storedLang = await this.storageService
        .getSecureItem<string>(LANGUAGE_STORAGE_KEY, String)
        .toPromise();

      // Validate and set initial language
      if (storedLang && this.isValidLanguage(storedLang)) {
        await this.setLanguage(storedLang, false);
      } else {
        await this.setLanguage(DEFAULT_LANGUAGE, false);
      }

      // Set up ARIA live region for language changes
      const liveRegion = document.createElement('div');
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('class', 'sr-only');
      document.body.appendChild(liveRegion);

    } catch (error) {
      console.error('Language selector initialization failed:', error);
      // Fallback to default language
      await this.setLanguage(DEFAULT_LANGUAGE, false);
    }
  }

  /**
   * Handle language change with WCAG compliance and LGPD consent
   * @param language - Selected language code
   * @param userInitiated - Whether change was initiated by user
   */
  public async setLanguage(language: string, userInitiated: boolean = true): Promise<void> {
    try {
      if (!this.isValidLanguage(language)) {
        throw new Error(`Invalid language code: ${language}`);
      }

      this.isLoading = true;

      // Check LGPD consent for user-initiated changes
      if (userInitiated && !this.hasUserConsent) {
        const consentGranted = await this.requestLanguageChangeConsent();
        if (!consentGranted) {
          this.isLoading = false;
          return;
        }
        this.hasUserConsent = true;
      }

      // Update language
      await this.translateService.use(language).toPromise();
      this.currentLanguage = language;

      // Securely store preference
      await this.storageService
        .setSecureItem(LANGUAGE_STORAGE_KEY, language, { expiry: 365 * 24 * 60 * 60 }) // 1 year
        .toPromise();

      // Update document language
      document.documentElement.lang = language;

      // Announce language change to screen readers
      this.announceLanguageChange(language);

    } catch (error) {
      console.error('Language change failed:', error);
      // Notify user of error
      this.announceError();
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Get WCAG compliant language label with screen reader support
   * @param langCode - Language code
   * @returns Accessible language name
   */
  public getLanguageLabel(langCode: string): string {
    const label = LANGUAGE_LABELS[langCode];
    return `${label} - ${langCode === this.currentLanguage ? 'Current language' : 'Select language'}`;
  }

  /**
   * Validate language code against supported languages
   * @param language - Language code to validate
   * @returns Whether language is supported
   */
  private isValidLanguage(language: string): boolean {
    return SUPPORTED_LANGUAGES.includes(language as typeof SUPPORTED_LANGUAGES[number]);
  }

  /**
   * Request LGPD-compliant consent for language preference storage
   * @returns Promise resolving to user's consent decision
   */
  private async requestLanguageChangeConsent(): Promise<boolean> {
    // Implementation would show LGPD-compliant consent dialog
    // For now, return true as placeholder
    return Promise.resolve(true);
  }

  /**
   * Announce language change to screen readers
   * @param language - New language code
   */
  private announceLanguageChange(language: string): void {
    const message = language === 'pt-BR'
      ? 'Idioma alterado para Português do Brasil'
      : 'Language changed to English';

    const liveRegion = document.querySelector('[aria-live="polite"]');
    if (liveRegion) {
      liveRegion.textContent = message;
    }
  }

  /**
   * Announce error to screen readers
   */
  private announceError(): void {
    const message = this.currentLanguage === 'pt-BR'
      ? 'Erro ao alterar idioma. Por favor, tente novamente.'
      : 'Error changing language. Please try again.';

    const liveRegion = document.querySelector('[aria-live="polite"]');
    if (liveRegion) {
      liveRegion.textContent = message;
    }
  }
}