import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core'; // v14.0.0
import { SecurityService } from '@angular/security'; // v15.0.0
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';

import { AuthService } from '../../../../core/auth/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ERROR_CODES } from '../../../../core/constants/api.constants';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit, OnDestroy {
  loginForm: FormGroup;
  isLoading = false;
  showMFAInput = false;
  errorMessage = '';
  attemptCount = 0;
  isRateLimited = false;
  private readonly maxAttempts = 5;
  private readonly rateLimitDuration = 900000; // 15 minutes
  private readonly destroy$ = new Subject<void>();

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private notificationService: NotificationService,
    private securityService: SecurityService,
    private translateService: TranslateService,
    private router: Router
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    // Set up CSRF protection
    this.securityService.initializeCsrf();
    
    // Reset rate limiting on component initialization
    this.checkRateLimiting();
  }

  private initializeForm(): void {
    this.loginForm = this.formBuilder.group({
      email: ['', [
        Validators.required,
        Validators.email,
        Validators.maxLength(255)
      ]],
      password: ['', [
        Validators.required,
        Validators.minLength(8),
        Validators.maxLength(128)
      ]],
      mfaToken: ['', [
        Validators.minLength(6),
        Validators.maxLength(6),
        Validators.pattern(/^\d+$/)
      ]],
      rememberMe: [false]
    });
  }

  async onSubmit(): Promise<void> {
    if (this.isRateLimited) {
      this.showRateLimitError();
      return;
    }

    if (this.loginForm.invalid) {
      this.translateService.get('LOGIN.FORM.VALIDATION_ERROR').subscribe(
        message => this.notificationService.showError(message)
      );
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      // Sanitize input data
      const credentials = {
        email: this.securityService.sanitizeInput(this.loginForm.get('email')?.value),
        password: this.loginForm.get('password')?.value // Don't sanitize password
      };

      const response = await this.authService.login(credentials).pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isLoading = false)
      ).toPromise();

      if (response.mfaRequired) {
        this.showMFAInput = true;
        this.translateService.get('LOGIN.MFA.REQUIRED').subscribe(
          message => this.notificationService.showSuccess(message)
        );
        return;
      }

      this.handleSuccessfulLogin();

    } catch (error: any) {
      this.handleLoginError(error);
    }
  }

  async verifyMFA(): Promise<void> {
    if (this.loginForm.get('mfaToken')?.invalid) {
      this.translateService.get('LOGIN.MFA.INVALID_TOKEN').subscribe(
        message => this.notificationService.showError(message)
      );
      return;
    }

    this.isLoading = true;

    try {
      const token = this.securityService.sanitizeInput(this.loginForm.get('mfaToken')?.value);
      
      await this.authService.verifyMFAToken(token).pipe(
        takeUntil(this.destroy$),
        finalize(() => this.isLoading = false)
      ).toPromise();

      this.handleSuccessfulLogin();

    } catch (error: any) {
      this.handleMFAError(error);
    }
  }

  private handleSuccessfulLogin(): void {
    this.resetRateLimiting();
    this.translateService.get('LOGIN.SUCCESS').subscribe(
      message => this.notificationService.showSuccess(message)
    );
    this.router.navigate(['/dashboard']);
  }

  private handleLoginError(error: any): void {
    this.incrementAttemptCount();

    if (error.code === ERROR_CODES.AUTHENTICATION_ERROR) {
      this.translateService.get('LOGIN.ERROR.INVALID_CREDENTIALS').subscribe(
        message => this.errorMessage = message
      );
    } else if (error.code === ERROR_CODES.RATE_LIMIT_EXCEEDED) {
      this.showRateLimitError();
    } else {
      this.translateService.get('LOGIN.ERROR.GENERIC').subscribe(
        message => this.errorMessage = message
      );
    }
  }

  private handleMFAError(error: any): void {
    if (error.code === ERROR_CODES.INVALID_TOKEN) {
      this.translateService.get('LOGIN.MFA.INVALID_TOKEN').subscribe(
        message => this.errorMessage = message
      );
    } else {
      this.translateService.get('LOGIN.MFA.ERROR').subscribe(
        message => this.errorMessage = message
      );
    }
  }

  private incrementAttemptCount(): void {
    this.attemptCount++;
    if (this.attemptCount >= this.maxAttempts) {
      this.enableRateLimiting();
    }
  }

  private enableRateLimiting(): void {
    this.isRateLimited = true;
    localStorage.setItem('loginRateLimit', JSON.stringify({
      timestamp: Date.now(),
      attempts: this.attemptCount
    }));
  }

  private checkRateLimiting(): void {
    const rateLimitData = localStorage.getItem('loginRateLimit');
    if (rateLimitData) {
      const { timestamp, attempts } = JSON.parse(rateLimitData);
      const timePassed = Date.now() - timestamp;
      
      if (timePassed < this.rateLimitDuration) {
        this.isRateLimited = true;
        this.attemptCount = attempts;
      } else {
        this.resetRateLimiting();
      }
    }
  }

  private resetRateLimiting(): void {
    this.isRateLimited = false;
    this.attemptCount = 0;
    localStorage.removeItem('loginRateLimit');
  }

  private showRateLimitError(): void {
    const remainingTime = Math.ceil((this.rateLimitDuration - 
      (Date.now() - JSON.parse(localStorage.getItem('loginRateLimit') || '{}').timestamp)) / 60000);
    
    this.translateService.get('LOGIN.ERROR.RATE_LIMIT', { minutes: remainingTime }).subscribe(
      message => this.errorMessage = message
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    
    // Clear sensitive form data
    this.loginForm.reset();
  }
}