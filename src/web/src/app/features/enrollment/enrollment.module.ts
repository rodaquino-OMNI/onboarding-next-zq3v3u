import { NgModule } from '@angular/core'; // @angular/core v15.0.0
import { CommonModule } from '@angular/common'; // @angular/common v15.0.0
import { ReactiveFormsModule } from '@angular/forms'; // @angular/forms v15.0.0
import { TranslateModule } from '@ngx-translate/core'; // @ngx-translate/core v14.0.0
import { HTTP_INTERCEPTORS } from '@angular/common/http'; // @angular/common/http v15.0.0

// Internal imports
import { EnrollmentRoutingModule } from './enrollment-routing.module';
import { EnrollmentFormComponent } from './pages/enrollment-form/enrollment-form.component';
import { DocumentUploadComponent } from './components/document-upload/document-upload.component';
import { HealthDeclarationComponent } from './components/health-declaration/health-declaration.component';
import { SharedModule } from '../../shared/shared.module';

// Security interceptor for HIPAA compliance
import { SecurityInterceptor } from '../../core/interceptors/security.interceptor';

/**
 * Feature module for healthcare enrollment functionality
 * Implements HIPAA compliance, secure document handling, and PHI protection
 * @version 1.0.0
 */
@NgModule({
  declarations: [
    // Core enrollment components
    EnrollmentFormComponent,
    DocumentUploadComponent,
    HealthDeclarationComponent
  ],
  imports: [
    // Angular modules
    CommonModule,
    ReactiveFormsModule,
    
    // Feature routing
    EnrollmentRoutingModule,
    
    // Shared functionality
    SharedModule,
    
    // Internationalization with lazy loading
    TranslateModule.forChild({
      extend: true, // Extend from root translations
      isolate: false // Share translations with parent modules
    })
  ],
  providers: [
    // Security interceptor for HIPAA compliance
    {
      provide: HTTP_INTERCEPTORS,
      useClass: SecurityInterceptor,
      multi: true
    }
  ],
  exports: [
    // Export components for use in other modules if needed
    EnrollmentFormComponent,
    DocumentUploadComponent,
    HealthDeclarationComponent
  ]
})
export class EnrollmentModule {
  constructor() {
    // Module initialization with security configurations
    this.initializeSecuritySettings();
  }

  /**
   * Initializes security settings for HIPAA compliance
   * @private
   */
  private initializeSecuritySettings(): void {
    // Ensure secure content policy
    if (typeof window !== 'undefined') {
      // Set secure Content Security Policy
      const meta = document.createElement('meta');
      meta.httpEquiv = 'Content-Security-Policy';
      meta.content = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self' https://api.austa.local",
        "frame-src 'none'",
        "object-src 'none'"
      ].join('; ');
      document.head.appendChild(meta);

      // Set additional security headers
      const securityHeaders = document.createElement('meta');
      securityHeaders.httpEquiv = 'X-Content-Security-Policy';
      securityHeaders.content = "sandbox 'allow-forms' 'allow-scripts'";
      document.head.appendChild(securityHeaders);
    }
  }
}