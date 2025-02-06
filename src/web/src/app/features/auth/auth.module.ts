import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core'; // v14.0.0
import { SharedModule } from '@shared/shared.module'; // v1.0.0

// Internal imports
import { AuthRoutingModule } from './auth-routing.module';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';

// Security and validation services
import { AuthGuard } from './guards/auth.guard';
import { RoleGuard } from './guards/role.guard';
import { MFAService } from './services/mfa.service';
import { SecurityService } from '@angular/security'; // v15.0.0

/**
 * Authentication feature module that provides secure user authentication
 * with MFA support, role-based access control, and multi-language capabilities.
 * Implements HIPAA, GDPR, and LGPD compliance requirements.
 * @version 1.0.0
 */
@NgModule({
  declarations: [
    LoginComponent,
    RegisterComponent
  ],
  imports: [
    // Angular modules
    CommonModule,
    ReactiveFormsModule,
    
    // Translation support
    TranslateModule.forChild({
      extend: true,
      isolate: false
    }),
    
    // Application modules
    SharedModule,
    AuthRoutingModule
  ],
  providers: [
    // Security providers
    AuthGuard,
    RoleGuard,
    MFAService,
    SecurityService,
    {
      provide: 'AUTH_CONFIG',
      useValue: {
        mfaEnabled: true,
        tokenExpiryTime: 3600, // 1 hour
        refreshTokenExpiry: 86400, // 24 hours
        maxLoginAttempts: 5,
        lockoutDuration: 900000, // 15 minutes
        passwordMinLength: 12,
        requireMfaForRoles: ['admin', 'interviewer'],
        supportedLanguages: ['pt-BR', 'en'],
        defaultLanguage: 'pt-BR',
        securityHeaders: {
          'Content-Security-Policy': "default-src 'self'",
          'X-Frame-Options': 'DENY',
          'X-XSS-Protection': '1; mode=block',
          'X-Content-Type-Options': 'nosniff'
        }
      }
    }
  ],
  exports: [
    // Export components for use in other modules
    LoginComponent,
    RegisterComponent,
    
    // Export services for dependency injection
    AuthGuard,
    RoleGuard
  ]
})
export class AuthModule {
  constructor(private securityService: SecurityService) {
    // Initialize security configurations
    this.initializeSecurity();
  }

  /**
   * Initializes security configurations and sets up CSRF protection
   * @private
   */
  private initializeSecurity(): void {
    // Enable CSRF protection
    this.securityService.initializeCsrf();

    // Configure security headers
    this.securityService.setSecurityHeaders({
      'Content-Security-Policy': "default-src 'self'",
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'X-Content-Type-Options': 'nosniff',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
    });

    // Configure rate limiting
    this.securityService.configureRateLimiting({
      windowMs: 900000, // 15 minutes
      maxRequests: 100,
      message: 'Too many requests, please try again later.'
    });

    // Enable XSS protection
    this.securityService.enableXssProtection();

    // Configure session security
    this.securityService.configureSession({
      secure: true,
      httpOnly: true,
      sameSite: 'strict'
    });
  }
}