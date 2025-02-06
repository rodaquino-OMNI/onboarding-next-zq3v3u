import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService, LangChangeEvent } from '@ngx-translate/core';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';

import { 
  Enrollment, 
  EnrollmentStatus, 
  PersonalInfo, 
  AddressInfo, 
  ContactInfo, 
  EnrollmentPreferences 
} from '../../../../core/interfaces/enrollment.interface';
import { EnrollmentService } from '../../../../core/services/enrollment.service';

@Component({
  selector: 'app-enrollment-form',
  templateUrl: './enrollment-form.component.html',
  styleUrls: ['./enrollment-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EnrollmentFormComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly formState$ = new Subject<Partial<Enrollment>>();
  private readonly autoSaveInterval = 30000; // 30 seconds

  public enrollment: Enrollment | null = null;
  public currentStep = 1;
  public loading = false;
  public enrollmentForm: FormGroup;
  public formErrors: { [key: string]: string } = {};
  public readonly EnrollmentStatus = EnrollmentStatus;

  constructor(
    private fb: FormBuilder,
    private enrollmentService: EnrollmentService,
    private translateService: TranslateService,
    private cdr: ChangeDetectorRef
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.setupFormSubscriptions();
    this.setupLanguageChanges();
    this.setupAutoSave();
    this.loadCurrentEnrollment();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeForm(): void {
    this.enrollmentForm = this.fb.group({
      personalInfo: this.fb.group({
        firstName: ['', [Validators.required, Validators.minLength(2)]],
        lastName: ['', [Validators.required, Validators.minLength(2)]],
        dateOfBirth: ['', [Validators.required]],
        gender: ['', [Validators.required]],
        ssn: ['', [Validators.required, Validators.pattern(/^\d{3}-\d{2}-\d{4}$/)]],
        maritalStatus: [''],
        nationality: ['', [Validators.required]],
        preferredLanguage: [this.translateService.currentLang || 'pt-BR']
      }),
      addressInfo: this.fb.group({
        street: ['', [Validators.required]],
        number: ['', [Validators.required]],
        complement: [''],
        neighborhood: ['', [Validators.required]],
        city: ['', [Validators.required]],
        state: ['', [Validators.required]],
        zipCode: ['', [Validators.required, Validators.pattern(/^\d{5}-\d{3}$/)]],
        country: ['Brasil', [Validators.required]],
        residenceSince: ['', [Validators.required]]
      }),
      contactInfo: this.fb.group({
        email: ['', [Validators.required, Validators.email]],
        emailVerified: [false],
        phone: ['', [Validators.required, Validators.pattern(/^\(\d{2}\) \d{5}-\d{4}$/)]],
        phoneVerified: [false],
        alternativePhone: [''],
        preferredContactMethod: ['email']
      }),
      preferences: this.fb.group({
        communicationLanguage: [this.translateService.currentLang || 'pt-BR'],
        notificationPreferences: this.fb.group({
          email: [true],
          sms: [true],
          push: [false]
        }),
        accessibilityRequirements: [[]],
        timeZone: ['America/Sao_Paulo']
      })
    });
  }

  private setupFormSubscriptions(): void {
    this.enrollmentForm.valueChanges.pipe(
      takeUntil(this.destroy$),
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(formValue => {
      this.validateForm();
      this.formState$.next(formValue);
      this.cdr.markForCheck();
    });

    this.formState$.pipe(
      takeUntil(this.destroy$),
      debounceTime(this.autoSaveInterval)
    ).subscribe(() => {
      this.saveEnrollment();
    });
  }

  private setupLanguageChanges(): void {
    this.translateService.onLangChange.pipe(
      takeUntil(this.destroy$)
    ).subscribe((event: LangChangeEvent) => {
      this.enrollmentForm.patchValue({
        preferences: {
          communicationLanguage: event.lang
        }
      });
      this.validateForm();
      this.cdr.markForCheck();
    });
  }

  private setupAutoSave(): void {
    setInterval(() => {
      if (this.enrollmentForm.dirty && this.enrollmentForm.valid) {
        this.saveEnrollment();
      }
    }, this.autoSaveInterval);
  }

  private loadCurrentEnrollment(): void {
    this.enrollmentService.currentEnrollment$.pipe(
      takeUntil(this.destroy$)
    ).subscribe(enrollment => {
      if (enrollment) {
        this.enrollment = enrollment;
        this.enrollmentForm.patchValue(enrollment.metadata);
        this.currentStep = this.calculateCurrentStep(enrollment.status);
        this.cdr.markForCheck();
      }
    });
  }

  private calculateCurrentStep(status: EnrollmentStatus): number {
    const stepMap: { [key in EnrollmentStatus]: number } = {
      [EnrollmentStatus.DRAFT]: 1,
      [EnrollmentStatus.DOCUMENTS_PENDING]: 2,
      [EnrollmentStatus.DOCUMENTS_SUBMITTED]: 3,
      [EnrollmentStatus.HEALTH_DECLARATION_PENDING]: 4,
      [EnrollmentStatus.INTERVIEW_SCHEDULED]: 5,
      [EnrollmentStatus.INTERVIEW_COMPLETED]: 6,
      [EnrollmentStatus.COMPLETED]: 7,
      [EnrollmentStatus.CANCELLED]: 1
    };
    return stepMap[status] || 1;
  }

  private validateForm(): void {
    this.formErrors = {};
    if (!this.enrollmentForm.valid) {
      Object.keys(this.enrollmentForm.controls).forEach(key => {
        const controlErrors = this.enrollmentForm.get(key)?.errors;
        if (controlErrors) {
          this.formErrors[key] = Object.keys(controlErrors)[0];
        }
      });
    }
  }

  public async saveEnrollment(): Promise<void> {
    if (this.enrollmentForm.valid && !this.loading) {
      this.loading = true;
      try {
        const formData = this.enrollmentForm.value;
        if (this.enrollment) {
          await this.enrollmentService.updateEnrollmentStatus(
            this.enrollment.id,
            EnrollmentStatus.DOCUMENTS_PENDING
          ).toPromise();
        } else {
          const createRequest = {
            user_id: 'current-user-id', // Should come from AuthService
            metadata: formData
          };
          await this.enrollmentService.createEnrollment(createRequest).toPromise();
        }
        this.enrollmentForm.markAsPristine();
      } catch (error) {
        console.error('Error saving enrollment:', error);
        // Handle error appropriately
      } finally {
        this.loading = false;
        this.cdr.markForCheck();
      }
    }
  }

  public nextStep(): void {
    if (this.currentStep < 7) {
      this.currentStep++;
      this.cdr.markForCheck();
    }
  }

  public previousStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.cdr.markForCheck();
    }
  }

  public canProceed(): boolean {
    return this.enrollmentForm.valid && !this.loading;
  }

  public getProgress(): number {
    return this.enrollment ? 
      this.enrollmentService.getEnrollmentProgress(this.enrollment) : 
      (this.currentStep - 1) * 16.67; // 100/6 steps
  }
}