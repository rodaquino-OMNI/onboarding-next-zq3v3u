import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { AuthService } from '../../../../core/auth/auth.service';
import { ValidationUtils } from '../../../../shared/utils/validation.utils';
import { SecurityUtils } from '@angular/security';
import { Language, UserRole } from '../../../../core/interfaces/user.interface';
import { INPUT_VALIDATION, REGEX_PATTERNS } from '../../../../core/constants/validation.constants';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements OnInit, OnDestroy {
  registerForm: FormGroup;
  isSubmitting = false;
  showPassword = false;
  availableLanguages: Language[] = [Language.Portuguese, Language.English];
  availableRoles: UserRole[] = [UserRole.Individual, UserRole.Broker];
  private destroy$ = new Subject<void>();
  private submissionAttempts = 0;
  private readonly maxSubmissionAttempts = 5;
  private readonly submissionTimeout = 300000; // 5 minutes
  private lastSubmissionTime: number | null = null;

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private translateService: TranslateService,
    private securityUtils: SecurityUtils,
    private validationUtils: ValidationUtils
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.setupFormValidation();
    this.setupLanguageDetection();
    this.setupAutoSave();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.clearAutoSavedData();
  }

  private initializeForm(): void {
    this.registerForm = this.formBuilder.group({
      name: ['', [
        Validators.required,
        Validators.minLength(INPUT_VALIDATION.MIN_LENGTH.name),
        Validators.maxLength(INPUT_VALIDATION.MAX_LENGTH.name),
        Validators.pattern(REGEX_PATTERNS.NAME)
      ]],
      email: ['', [
        Validators.required,
        Validators.maxLength(INPUT_VALIDATION.MAX_LENGTH.email),
        Validators.pattern(REGEX_PATTERNS.EMAIL)
      ]],
      cpf: ['', [
        Validators.required,
        Validators.pattern(REGEX_PATTERNS.CPF)
      ]],
      password: ['', [
        Validators.required,
        Validators.minLength(INPUT_VALIDATION.MIN_LENGTH.password),
        Validators.maxLength(INPUT_VALIDATION.MAX_LENGTH.password)
      ]],
      confirmPassword: ['', [Validators.required]],
      role: [UserRole.Individual, [Validators.required]],
      language: [this.translateService.currentLang || Language.Portuguese, [Validators.required]],
      termsAccepted: [false, [Validators.requiredTrue]]
    }, {
      validators: this.passwordMatchValidator
    });
  }

  private setupFormValidation(): void {
    // Real-time email validation
    this.registerForm.get('email')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(email => {
        if (email) {
          const emailValidation = this.validationUtils.isEmailValid(email);
          if (!emailValidation.isValid) {
            this.registerForm.get('email')?.setErrors({ customError: emailValidation.errors });
          }
        }
      });

    // Real-time password strength validation
    this.registerForm.get('password')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(password => {
        if (password) {
          const passwordValidation = this.validationUtils.isPasswordValid(password);
          if (!passwordValidation.isValid) {
            this.registerForm.get('password')?.setErrors({ 
              customError: passwordValidation.errors,
              strengthScore: passwordValidation.details?.strengthScore 
            });
          }
        }
      });

    // CPF validation for Brazilian users
    this.registerForm.get('cpf')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(cpf => {
        if (cpf) {
          const sanitizedCPF = this.securityUtils.sanitizeInput(cpf);
          if (!this.validateCPF(sanitizedCPF)) {
            this.registerForm.get('cpf')?.setErrors({ invalidCPF: true });
          }
        }
      });
  }

  private setupLanguageDetection(): void {
    const browserLang = this.translateService.getBrowserLang();
    if (browserLang && this.availableLanguages.includes(browserLang as Language)) {
      this.registerForm.patchValue({ language: browserLang });
      this.translateService.use(browserLang);
    }
  }

  private setupAutoSave(): void {
    this.registerForm.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(formValue => {
        // Don't save sensitive data
        const safeData = { ...formValue };
        delete safeData.password;
        delete safeData.confirmPassword;
        localStorage.setItem('registration_draft', this.securityUtils.encrypt(JSON.stringify(safeData)));
      });
  }

  private passwordMatchValidator(form: FormGroup): { passwordMismatch: boolean } | null {
    const password = form.get('password')?.value;
    const confirmPassword = form.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { passwordMismatch: true };
  }

  private validateCPF(cpf: string): boolean {
    // CPF validation algorithm implementation
    cpf = cpf.replace(/[^\d]/g, '');
    if (cpf.length !== 11) return false;

    let sum = 0;
    let remainder: number;

    for (let i = 1; i <= 9; i++) {
      sum += parseInt(cpf.substring(i - 1, i)) * (11 - i);
    }

    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.substring(9, 10))) return false;

    sum = 0;
    for (let i = 1; i <= 10; i++) {
      sum += parseInt(cpf.substring(i - 1, i)) * (12 - i);
    }

    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cpf.substring(10, 11))) return false;

    return true;
  }

  private validateSubmissionRate(): boolean {
    const currentTime = Date.now();
    
    if (this.submissionAttempts >= this.maxSubmissionAttempts) {
      if (!this.lastSubmissionTime || 
          (currentTime - this.lastSubmissionTime) < this.submissionTimeout) {
        return false;
      }
      this.submissionAttempts = 0;
    }
    
    this.lastSubmissionTime = currentTime;
    this.submissionAttempts++;
    return true;
  }

  private clearAutoSavedData(): void {
    localStorage.removeItem('registration_draft');
  }

  async onSubmit(): Promise<void> {
    if (this.isSubmitting || !this.registerForm.valid) return;
    if (!this.validateSubmissionRate()) {
      // Handle rate limit exceeded
      return;
    }

    try {
      this.isSubmitting = true;
      const formData = this.registerForm.value;
      
      // Sanitize input data
      const sanitizedData = {
        name: this.securityUtils.sanitizeInput(formData.name),
        email: this.securityUtils.sanitizeInput(formData.email.toLowerCase()),
        cpf: this.securityUtils.sanitizeInput(formData.cpf),
        password: formData.password, // Already validated
        role: formData.role,
        language: formData.language
      };

      // Generate CSRF token
      const csrfToken = await this.securityUtils.generateCsrfToken();

      // Submit registration
      await this.authService.register({
        ...sanitizedData,
        _csrf: csrfToken
      }).toPromise();

      // Clear auto-saved data on success
      this.clearAutoSavedData();
      
      // Handle successful registration
      // Navigation handled by auth service

    } catch (error) {
      // Handle registration error
      console.error('Registration error:', error);
      this.registerForm.setErrors({ registrationFailed: true });
    } finally {
      this.isSubmitting = false;
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }
}