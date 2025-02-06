import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { 
  HealthData, 
  EncryptionMetadata,
  HealthDataField 
} from '../../../../core/interfaces/health-record.interface';
import { HealthRecordService } from '../../../../core/services/health-record.service';
import { EncryptionService } from '@core/encryption'; // v1.0.0

@Component({
  selector: 'app-health-declaration',
  templateUrl: './health-declaration.component.html',
  styleUrls: ['./health-declaration.component.scss']
})
export class HealthDeclarationComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private formChanges$ = new Subject<any>();

  public healthForm: FormGroup;
  public loading = false;
  public submitted = false;
  public encryptionStatus = new Map<string, boolean>();
  public validationErrors = new Map<string, string[]>();

  // Health data field constants
  private readonly PHI_FIELDS = [
    HealthDataField.MEDICAL_HISTORY,
    HealthDataField.CURRENT_MEDICATIONS,
    HealthDataField.SURGICAL_HISTORY,
    HealthDataField.MENTAL_HEALTH
  ];

  constructor(
    private fb: FormBuilder,
    private healthRecordService: HealthRecordService,
    private encryptionService: EncryptionService
  ) {
    this.initSecureForm();
  }

  ngOnInit(): void {
    // Set up debounced form value changes listener
    this.healthForm.valueChanges.pipe(
      takeUntil(this.destroy$),
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(async (value) => {
      await this.handleFormChanges(value);
    });

    // Initialize encryption status for PHI fields
    this.PHI_FIELDS.forEach(field => {
      this.encryptionStatus.set(field, false);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initSecureForm(): void {
    this.healthForm = this.fb.group({
      medical_history: ['', [Validators.required]],
      current_medications: this.fb.array([]),
      allergies: ['', [Validators.required]],
      chronic_conditions: ['', [Validators.required]],
      family_history: ['', [Validators.required]],
      lifestyle_factors: this.fb.group({
        smoking_status: [''],
        alcohol_consumption: [''],
        exercise_frequency: [''],
        diet_restrictions: [[]]
      }),
      vital_signs: this.fb.group({
        blood_pressure: ['', [Validators.pattern(/^\d{2,3}\/\d{2,3}$/)]],
        heart_rate: ['', [Validators.min(30), Validators.max(200)]],
        temperature: ['', [Validators.min(35), Validators.max(42)]],
        height: ['', [Validators.required, Validators.min(0)]],
        weight: ['', [Validators.required, Validators.min(0)]]
      }),
      surgical_history: this.fb.array([]),
      mental_health: this.fb.group({
        conditions: [[]],
        treatments: [[]],
        medications: this.fb.array([])
      })
    });
  }

  public addMedication(): void {
    const medications = this.healthForm.get('current_medications') as any;
    medications.push(this.fb.group({
      name: ['', Validators.required],
      dosage: ['', Validators.required],
      frequency: ['', Validators.required],
      start_date: ['', Validators.required],
      end_date: ['']
    }));
  }

  public removeMedication(index: number): void {
    const medications = this.healthForm.get('current_medications') as any;
    medications.removeAt(index);
  }

  public addSurgicalHistory(): void {
    const surgicalHistory = this.healthForm.get('surgical_history') as any;
    surgicalHistory.push(this.fb.group({
      procedure: ['', Validators.required],
      date: ['', Validators.required],
      hospital: [''],
      notes: ['']
    }));
  }

  public removeSurgicalHistory(index: number): void {
    const surgicalHistory = this.healthForm.get('surgical_history') as any;
    surgicalHistory.removeAt(index);
  }

  private async handleFormChanges(value: any): Promise<void> {
    try {
      // Validate form data
      this.validateForm();

      // Encrypt PHI fields
      for (const field of this.PHI_FIELDS) {
        if (value[field]) {
          const encryptedValue = await this.encryptFormField(field, value[field]);
          this.healthForm.patchValue({ [field]: encryptedValue }, { emitEvent: false });
          this.encryptionStatus.set(field, true);
        }
      }
    } catch (error) {
      console.error('Error handling form changes:', error);
      this.validationErrors.set('form', ['Error processing form data']);
    }
  }

  private async encryptFormField(fieldName: string, value: any): Promise<string> {
    try {
      const encryptedValue = await this.encryptionService.encryptField(value);
      return encryptedValue;
    } catch (error) {
      console.error(`Error encrypting field ${fieldName}:`, error);
      this.encryptionStatus.set(fieldName, false);
      throw error;
    }
  }

  private validateForm(): void {
    this.validationErrors.clear();
    Object.keys(this.healthForm.controls).forEach(key => {
      const control = this.healthForm.get(key);
      if (control && control.errors) {
        this.validationErrors.set(key, Object.keys(control.errors));
      }
    });
  }

  public async onSecureSubmit(): Promise<void> {
    this.submitted = true;
    
    if (this.healthForm.invalid) {
      this.validateForm();
      return;
    }

    try {
      this.loading = true;

      // Prepare encrypted health data
      const healthData: HealthData = this.healthForm.value;
      const encryptionMetadata: EncryptionMetadata = {
        algorithm: 'AES-256-GCM',
        key_id: await this.encryptionService.generateKeyId(),
        encrypted_at: new Date().toISOString()
      };

      // Submit encrypted health record
      await this.healthRecordService.createHealthRecord({
        health_data: healthData,
        encryption_metadata: encryptionMetadata,
        verified: false,
        submitted_at: new Date().toISOString()
      }).toPromise();

      this.submitted = false;
      this.healthForm.reset();
      
    } catch (error) {
      console.error('Error submitting health declaration:', error);
      this.validationErrors.set('submit', ['Error submitting health declaration']);
    } finally {
      this.loading = false;
    }
  }

  public isFieldEncrypted(fieldName: string): boolean {
    return this.encryptionStatus.get(fieldName) || false;
  }

  public getFieldErrors(fieldName: string): string[] {
    return this.validationErrors.get(fieldName) || [];
  }
}