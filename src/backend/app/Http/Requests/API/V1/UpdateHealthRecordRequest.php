<?php

namespace App\Http\Requests\API\V1;

use App\Models\HealthRecord;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Log;

/**
 * Form request class for validating health record updates with HIPAA compliance and PHI protection
 */
class UpdateHealthRecordRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to update the health record with HIPAA compliance checks.
     *
     * @return bool
     * @throws \Illuminate\Auth\Access\AuthorizationException
     */
    public function authorize(): bool
    {
        $user = $this->user();
        $healthRecord = $this->route('health_record');

        // Check if user owns the enrollment or has admin/staff role
        $isAuthorized = $user->id === $healthRecord->enrollment->user_id ||
            $user->hasRole('admin') ||
            $user->hasRole('interviewer');

        // Log authorization attempt for HIPAA audit
        Log::channel('hipaa-audit')->info('Health record update authorization', [
            'user_id' => $user->id,
            'health_record_id' => $healthRecord->id,
            'authorized' => $isAuthorized,
            'ip_address' => $this->ip(),
            'user_agent' => $this->userAgent()
        ]);

        return $isAuthorized;
    }

    /**
     * Get the validation rules for health record updates with PHI protection.
     *
     * @return array
     */
    public function rules(): array
    {
        return [
            'medical_history' => ['required', 'array', 'min:1'],
            'medical_history.*.condition' => ['required', 'string', 'max:255'],
            'medical_history.*.diagnosis_date' => ['required', 'date'],
            'medical_history.*.treatment_status' => ['required', 'string', 'in:active,resolved,ongoing'],
            
            'current_medications' => ['required', 'array', 'min:1'],
            'current_medications.*.name' => ['required', 'string', 'max:255'],
            'current_medications.*.dosage' => ['required', 'string', 'max:50'],
            'current_medications.*.frequency' => ['required', 'string', 'max:50'],
            'current_medications.*.prescribed_by' => ['required', 'string', 'max:255'],
            
            'allergies' => ['required', 'array'],
            'allergies.*.allergen' => ['required', 'string', 'max:255'],
            'allergies.*.severity' => ['required', 'string', 'in:mild,moderate,severe'],
            'allergies.*.reaction' => ['required', 'string', 'max:255'],
            
            'chronic_conditions' => ['array'],
            'chronic_conditions.*.condition' => ['required', 'string', 'max:255'],
            'chronic_conditions.*.icd10_code' => ['required', 'string', 'regex:/^[A-Z][0-9][0-9AB]\.[0-9]{1,4}$/'],
            'chronic_conditions.*.onset_date' => ['required', 'date'],
            
            'family_history' => ['array'],
            'family_history.*.condition' => ['required', 'string', 'max:255'],
            'family_history.*.relationship' => ['required', 'string', 'in:parent,sibling,grandparent,child'],
            'family_history.*.age_at_onset' => ['required', 'integer', 'min:0', 'max:120'],
            
            'lifestyle_factors' => ['array'],
            'lifestyle_factors.smoking_status' => ['string', 'in:never,former,current'],
            'lifestyle_factors.alcohol_consumption' => ['string', 'in:none,occasional,moderate,heavy'],
            'lifestyle_factors.exercise_frequency' => ['string', 'in:none,occasional,regular,frequent'],
            'lifestyle_factors.diet_type' => ['string', 'max:100'],
            
            'emergency_contacts' => ['required', 'array', 'min:1'],
            'emergency_contacts.*.name' => ['required', 'string', 'max:255'],
            'emergency_contacts.*.relationship' => ['required', 'string', 'max:100'],
            'emergency_contacts.*.phone' => ['required', 'string', 'regex:/^[0-9+\-\s()]{10,20}$/'],
            
            'primary_physician' => ['required', 'array'],
            'primary_physician.name' => ['required', 'string', 'max:255'],
            'primary_physician.specialty' => ['required', 'string', 'max:100'],
            'primary_physician.phone' => ['required', 'string', 'regex:/^[0-9+\-\s()]{10,20}$/'],
            'primary_physician.address' => ['required', 'string', 'max:500'],
            
            'insurance_details' => ['required', 'array'],
            'insurance_details.provider' => ['required', 'string', 'max:255'],
            'insurance_details.policy_number' => ['required', 'string', 'max:100'],
            'insurance_details.group_number' => ['required', 'string', 'max:100'],
            'insurance_details.effective_date' => ['required', 'date']
        ];
    }

    /**
     * Get custom HIPAA-compliant validation error messages.
     *
     * @return array
     */
    public function messages(): array
    {
        return [
            'medical_history.required' => 'Medical history information is required.',
            'medical_history.*.condition.required' => 'Medical condition must be specified.',
            'medical_history.*.diagnosis_date.required' => 'Diagnosis date is required.',
            'medical_history.*.treatment_status.required' => 'Treatment status must be specified.',
            
            'current_medications.required' => 'Current medication information is required.',
            'current_medications.*.name.required' => 'Medication name must be specified.',
            'current_medications.*.dosage.required' => 'Medication dosage is required.',
            'current_medications.*.frequency.required' => 'Medication frequency must be specified.',
            
            'allergies.required' => 'Allergy information is required.',
            'allergies.*.allergen.required' => 'Allergen must be specified.',
            'allergies.*.severity.required' => 'Allergy severity must be specified.',
            'allergies.*.reaction.required' => 'Allergic reaction must be specified.',
            
            'chronic_conditions.*.icd10_code.regex' => 'Invalid ICD-10 code format.',
            
            'emergency_contacts.required' => 'At least one emergency contact is required.',
            'emergency_contacts.*.phone.regex' => 'Invalid phone number format.',
            
            'primary_physician.required' => 'Primary physician information is required.',
            'primary_physician.phone.regex' => 'Invalid physician phone number format.',
            
            'insurance_details.required' => 'Insurance information is required.',
            'insurance_details.policy_number.required' => 'Insurance policy number is required.',
            'insurance_details.effective_date.required' => 'Insurance effective date is required.'
        ];
    }

    /**
     * Configure the validator instance.
     *
     * @param \Illuminate\Validation\Validator $validator
     * @return void
     */
    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            // Log validation attempt for HIPAA compliance
            Log::channel('hipaa-audit')->info('Health record validation', [
                'user_id' => $this->user()->id,
                'health_record_id' => $this->route('health_record')->id,
                'validation_passed' => !$validator->fails(),
                'fields_validated' => array_keys($this->rules()),
                'ip_address' => $this->ip(),
                'user_agent' => $this->userAgent()
            ]);
        });
    }
}