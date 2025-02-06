import { NgModule, ModuleWithProviders } from '@angular/core';
import { TranslateModule, TranslateLoader, TranslateService } from '@ngx-translate/core';
import { LocalStorage } from '@ngx-pwa/local-storage';
import { BehaviorSubject } from 'rxjs';

// Import translations
import { common as enCommon, auth as enAuth, enrollment as enEnrollment, privacy as enPrivacy } from './translations/en.json';
import { common as ptCommon, auth as ptAuth, enrollment as ptEnrollment, privacy as ptPrivacy } from './translations/pt-BR.json';

/**
 * Custom translation loader that handles preloading and caching of translations
 * with enhanced LGPD compliance and accessibility features
 */
export class CustomTranslateLoader implements TranslateLoader {
  private translations = {
    'en': {
      common: enCommon,
      auth: enAuth,
      enrollment: enEnrollment,
      privacy: enPrivacy
    },
    'pt-BR': {
      common: ptCommon,
      auth: ptAuth,
      enrollment: ptEnrollment,
      privacy: ptPrivacy
    }
  };

  getTranslation(lang: string): Promise<any> {
    return Promise.resolve(this.translations[lang] || this.translations['pt-BR']);
  }
}

/**
 * I18nModule provides internationalization support with enhanced LGPD compliance
 * and accessibility features for the AUSTA Integration Platform
 */
@NgModule({
  imports: [
    TranslateModule.forChild()
  ],
  exports: [
    TranslateModule
  ]
})
export class I18nModule {
  private readonly STORAGE_KEY = 'austa.language';
  private readonly SUPPORTED_LANGUAGES = ['en', 'pt-BR'];
  private readonly DEFAULT_LANGUAGE = 'pt-BR';
  private readonly FALLBACK_LANGUAGE = 'en';

  public currentLang$ = new BehaviorSubject<string>(this.DEFAULT_LANGUAGE);

  constructor(
    private translate: TranslateService,
    private storage: LocalStorage
  ) {}

  /**
   * Configures the I18nModule with enhanced LGPD compliance and accessibility features
   */
  static forRoot(): ModuleWithProviders<I18nModule> {
    return {
      ngModule: I18nModule,
      providers: [
        {
          provide: TranslateLoader,
          useClass: CustomTranslateLoader
        },
        {
          provide: TranslateModule.forRoot({
            defaultLanguage: 'pt-BR',
            useDefaultLang: true,
            isolate: false
          }).providers
        }
      ]
    };
  }

  /**
   * Initializes the i18n module with language preferences and LGPD compliance
   */
  async initialize(): Promise<void> {
    try {
      // Set up supported languages
      this.translate.addLangs(this.SUPPORTED_LANGUAGES);
      this.translate.setDefaultLang(this.DEFAULT_LANGUAGE);
      this.translate.setFallbackLang(this.FALLBACK_LANGUAGE);

      // Load stored language preference
      const storedLang = await this.storage.getItem<string>(this.STORAGE_KEY).toPromise();
      const initialLang = storedLang && this.SUPPORTED_LANGUAGES.includes(storedLang) 
        ? storedLang 
        : this.DEFAULT_LANGUAGE;

      await this.setLanguage(initialLang);
      await this.preloadTranslations();

    } catch (error) {
      console.error('Error initializing i18n module:', error);
      // Fallback to default language
      await this.setLanguage(this.DEFAULT_LANGUAGE);
    }
  }

  /**
   * Changes the application language with enhanced accessibility support
   */
  async setLanguage(lang: string): Promise<void> {
    try {
      if (!this.SUPPORTED_LANGUAGES.includes(lang)) {
        throw new Error(`Unsupported language: ${lang}`);
      }

      // Update language
      await this.translate.use(lang).toPromise();
      await this.storage.setItem(this.STORAGE_KEY, lang).toPromise();
      this.currentLang$.next(lang);

      // Update document language for accessibility
      document.documentElement.lang = lang;
      document.documentElement.dir = 'ltr'; // Add RTL support if needed

      // Update accessibility attributes
      this.updateAccessibilityAttributes(lang);

    } catch (error) {
      console.error('Error setting language:', error);
      throw error;
    }
  }

  /**
   * Preloads critical translations including LGPD-required content
   */
  private async preloadTranslations(): Promise<void> {
    try {
      const criticalPaths = [
        'common.accessibility',
        'privacy.lgpd',
        'common.buttons',
        'common.labels',
        'errors'
      ];

      await Promise.all(
        this.SUPPORTED_LANGUAGES.map(lang =>
          this.translate.getTranslation(lang)
            .toPromise()
            .then(translations => {
              criticalPaths.forEach(path => {
                this.translate.setTranslation(
                  lang,
                  { [path]: translations[path] },
                  true
                );
              });
            })
        )
      );
    } catch (error) {
      console.error('Error preloading translations:', error);
      throw error;
    }
  }

  /**
   * Updates accessibility attributes for screen readers
   */
  private updateAccessibilityAttributes(lang: string): void {
    // Update ARIA labels based on language
    const mainContent = document.querySelector('main');
    if (mainContent) {
      mainContent.setAttribute('aria-label', 
        lang === 'pt-BR' ? 'Conteúdo principal' : 'Main content'
      );
    }

    // Update skip link text
    const skipLink = document.querySelector('.skip-link');
    if (skipLink) {
      skipLink.textContent = 
        lang === 'pt-BR' ? 'Pular para o conteúdo principal' : 'Skip to main content';
    }
  }
}