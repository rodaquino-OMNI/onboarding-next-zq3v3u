import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClient, HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { ServiceWorkerModule } from '@angular/service-worker';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { IonicModule } from '@ionic/angular';

// Internal imports
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { SharedModule } from './shared/shared.module';
import { JwtInterceptor } from './core/interceptors/jwt.interceptor';
import { ErrorInterceptor } from './core/interceptors/error.interceptor';
import { environment } from '../environments/environment';

/**
 * Factory function to create translation loader with caching support
 * @param http HttpClient instance
 * @returns TranslateHttpLoader configured for healthcare translations
 */
export function createTranslateLoader(http: HttpClient): TranslateHttpLoader {
  return new TranslateHttpLoader(
    http,
    './assets/i18n/',
    '.json?v=' + environment.APP_VERSION
  );
}

/**
 * Root module of the AUSTA Integration Platform
 * Configures core functionality including:
 * - Internationalization with healthcare terminology
 * - JWT-based authentication
 * - PWA capabilities
 * - Cross-platform support via Ionic
 * @version 1.0.0
 */
@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    // Angular core modules
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,

    // PWA support
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: environment.production,
      registrationStrategy: 'registerWhenStable:30000'
    }),

    // Ionic framework configuration
    IonicModule.forRoot({
      mode: 'md',
      backButtonText: '',
      backButtonIcon: 'arrow-back-outline',
      animated: true,
      rippleEffect: true,
      hardwareBackButton: true
    }),

    // Translation module configuration
    TranslateModule.forRoot({
      defaultLanguage: environment.i18n.defaultLanguage,
      loader: {
        provide: TranslateLoader,
        useFactory: createTranslateLoader,
        deps: [HttpClient]
      },
      isolate: false,
      extend: true,
      useDefaultLang: true
    }),

    // Application modules
    SharedModule.forRoot(),
    AppRoutingModule
  ],
  providers: [
    // HTTP interceptors
    {
      provide: HTTP_INTERCEPTORS,
      useClass: JwtInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ErrorInterceptor,
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}