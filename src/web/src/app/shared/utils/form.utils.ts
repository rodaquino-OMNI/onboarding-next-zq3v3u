/**
 * @fileoverview Enterprise-grade form utilities for the AUSTA Integration Platform
 * Provides robust form handling with accessibility support and error tracking
 * @version 1.0.0
 */

import { 
  FormGroup, 
  FormControl, 
  FormArray, 
  AbstractControl, 
  ValidationErrors 
} from '@angular/forms'; // v15.0.0
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'; // v7.5.0
import { 
  INPUT_VALIDATION, 
  REGEX_PATTERNS, 
  HEALTH_RECORD_VALIDATION 
} from '../../core/constants/validation.constants';
import { 
  isEmailValid, 
  validateHealthRecord, 
  validateFormField 
} from './validation.utils';

/**
 * Interface for form patch options
 */
interface PatchOptions {
  emitEvent?: boolean;
  onlySelf?: boolean;
  preserveState?: boolean;
}

/**
 * Interface for validation options
 */
interface ValidationOptions {
  debounceTime?: number;
  emitEvent?: boolean;
  validators?: any[];
}

/**
 * Resets a form to its initial state while preserving accessibility
 * @param form - Angular FormGroup instance
 * @param defaultValues - Optional default values to apply
 * @param preserveState - Whether to preserve certain form state aspects
 */
export function resetForm(
  form: FormGroup,
  defaultValues?: Record<string, any>,
  preserveState: boolean = false
): void {
  try {
    // Store current state if preservation is requested
    const preservedState = preserveState ? {
      dirty: form.dirty,
      touched: form.touched,
      pristine: form.pristine
    } : null;

    // Reset form and apply default values
    form.reset(defaultValues || {});

    // Restore preserved state if requested
    if (preservedState) {
      Object.keys(preservedState).forEach(key => {
        if (form.hasOwnProperty(key)) {
          (form as any)[key] = preservedState[key];
        }
      });
    }

    // Reset ARIA attributes
    Object.keys(form.controls).forEach(key => {
      const control = form.get(key);
      if (control) {
        const element = document.querySelector(`[formcontrolname="${key}"]`);
        if (element) {
          element.setAttribute('aria-invalid', 'false');
          element.removeAttribute('aria-errormessage');
        }
      }
    });

    form.updateValueAndValidity();
  } catch (error) {
    console.error('Form reset error:', error);
    throw new Error('Failed to reset form');
  }
}

/**
 * Recursively marks all controls in a form group as touched
 * @param formGroup - Angular FormGroup instance
 */
export function markFormGroupTouched(formGroup: FormGroup): void {
  try {
    Object.values(formGroup.controls).forEach(control => {
      if (control instanceof FormControl) {
        control.markAsTouched();
        
        // Update ARIA attributes
        const element = document.querySelector(`[formcontrolname="${control.value}"]`);
        if (element) {
          element.setAttribute('aria-invalid', control.errors ? 'true' : 'false');
        }
      } else if (control instanceof FormGroup) {
        markFormGroupTouched(control);
      } else if (control instanceof FormArray) {
        (control as FormArray).controls.forEach(arrayControl => {
          if (arrayControl instanceof FormGroup) {
            markFormGroupTouched(arrayControl);
          }
        });
      }
    });
  } catch (error) {
    console.error('Error marking form group touched:', error);
    throw new Error('Failed to mark form group as touched');
  }
}

/**
 * Retrieves all validation errors from a form group with detailed tracking
 * @param form - Angular FormGroup instance
 * @returns Structured validation errors object
 */
export function getFormValidationErrors(form: FormGroup): ValidationErrors {
  const errors: ValidationErrors = {};
  
  try {
    const processControl = (
      control: AbstractControl,
      path: string[] = []
    ): void => {
      if (control instanceof FormControl) {
        if (control.errors) {
          errors[path.join('.')] = {
            errors: control.errors,
            value: control.value,
            touched: control.touched
          };
        }
      } else if (control instanceof FormGroup) {
        Object.keys(control.controls).forEach(key => {
          processControl(control.get(key)!, [...path, key]);
        });
      } else if (control instanceof FormArray) {
        control.controls.forEach((arrayControl, index) => {
          processControl(arrayControl, [...path, index.toString()]);
        });
      }
    };

    processControl(form);
  } catch (error) {
    console.error('Error getting form validation errors:', error);
    throw new Error('Failed to retrieve form validation errors');
  }

  return errors;
}

/**
 * Creates a form array with enhanced validation and accessibility
 * @param items - Initial array items
 * @param controlFactory - Factory function for creating controls
 * @param options - Validation options
 * @returns Configured FormArray instance
 */
export function createFormArray(
  items: any[],
  controlFactory: (item: any) => AbstractControl,
  options: ValidationOptions = {}
): FormArray {
  try {
    const formArray = new FormArray(
      items.map(item => controlFactory(item)),
      options.validators
    );

    // Set up value change subscription with debounce
    if (options.debounceTime) {
      formArray.valueChanges.pipe(
        debounceTime(options.debounceTime),
        distinctUntilChanged()
      ).subscribe(() => {
        if (options.emitEvent) {
          formArray.updateValueAndValidity();
        }
      });
    }

    return formArray;
  } catch (error) {
    console.error('Error creating form array:', error);
    throw new Error('Failed to create form array');
  }
}

/**
 * Safely patches values into a form with deep object handling
 * @param form - Angular FormGroup instance
 * @param values - Values to patch
 * @param options - Patch options
 */
export function patchFormValues(
  form: FormGroup,
  values: Record<string, any>,
  options: PatchOptions = {}
): void {
  try {
    // Create deep clone of values to prevent mutations
    const clonedValues = JSON.parse(JSON.stringify(values));

    // Filter valid control names
    const validControls = Object.keys(clonedValues).filter(key => 
      form.contains(key)
    );

    // Patch only valid controls
    const patchObject = validControls.reduce((acc, key) => {
      acc[key] = clonedValues[key];
      return acc;
    }, {} as Record<string, any>);

    // Apply patches with options
    form.patchValue(patchObject, {
      emitEvent: options.emitEvent,
      onlySelf: options.onlySelf
    });

    // Handle nested form arrays
    Object.keys(form.controls).forEach(key => {
      const control = form.get(key);
      if (control instanceof FormArray && clonedValues[key]?.length) {
        while (control.length) {
          control.removeAt(0);
        }
        clonedValues[key].forEach((item: any) => {
          control.push(new FormControl(item));
        });
      }
    });

    // Update validation and accessibility
    form.updateValueAndValidity();
    Object.keys(form.controls).forEach(key => {
      const control = form.get(key);
      const element = document.querySelector(`[formcontrolname="${key}"]`);
      if (element && control) {
        element.setAttribute('aria-invalid', control.errors ? 'true' : 'false');
      }
    });
  } catch (error) {
    console.error('Error patching form values:', error);
    throw new Error('Failed to patch form values');
  }
}