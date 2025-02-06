<?php

namespace App\Http\Requests\API\V1;

use Illuminate\Foundation\Http\FormRequest; // ^9.0
use App\Models\Enrollment;

class CreateEnrollmentRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     *
     * @return bool
     */
    public function authorize(): bool
    {
        return auth()->check() && auth()->user()->hasRole('individual');
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array
     */
    public function rules(): array
    {
        return [
            // User and Status Validation
            'user_id' => 'required|uuid|exists:users,id',
            'status' => 'required|string|in:' . implode(',', Enrollment::ENROLLMENT_STATUSES),

            // Personal Information
            'metadata.personal_info.first_name' => 'required|string|min:2|max:100',
            'metadata.personal_info.last_name' => 'required|string|min:2|max:100',
            'metadata.personal_info.birth_date' => 'required|date|before:today|after:1900-01-01',
            'metadata.personal_info.gender' => 'required|string|in:male,female,other,prefer_not_to_say',
            'metadata.personal_info.cpf' => 'required|string|size:11|unique:enrollments,metadata->personal_info->cpf',
            'metadata.personal_info.rg' => 'required|string|max:20',
            'metadata.personal_info.marital_status' => 'required|string|in:single,married,divorced,widowed',

            // Contact Information
            'metadata.contact_info.email' => 'required|email|max:255',
            'metadata.contact_info.phone_primary' => 'required|string|regex:/^\+?[1-9]\d{1,14}$/',
            'metadata.contact_info.phone_secondary' => 'nullable|string|regex:/^\+?[1-9]\d{1,14}$/',
            'metadata.contact_info.preferred_contact' => 'required|string|in:email,phone,either',
            'metadata.contact_info.preferred_language' => 'required|string|in:en,pt-BR',

            // Address Information
            'metadata.address_info.street' => 'required|string|max:255',
            'metadata.address_info.number' => 'required|string|max:20',
            'metadata.address_info.complement' => 'nullable|string|max:100',
            'metadata.address_info.neighborhood' => 'required|string|max:100',
            'metadata.address_info.city' => 'required|string|max:100',
            'metadata.address_info.state' => 'required|string|size:2',
            'metadata.address_info.postal_code' => 'required|string|size:8',

            // Health Declaration
            'metadata.health_declaration.has_chronic_conditions' => 'required|boolean',
            'metadata.health_declaration.chronic_conditions' => 'required_if:metadata.health_declaration.has_chronic_conditions,true|array',
            'metadata.health_declaration.chronic_conditions.*' => 'string|max:255',
            'metadata.health_declaration.current_medications' => 'array',
            'metadata.health_declaration.current_medications.*.name' => 'required_with:metadata.health_declaration.current_medications|string|max:255',
            'metadata.health_declaration.current_medications.*.dosage' => 'required_with:metadata.health_declaration.current_medications|string|max:100',
            'metadata.health_declaration.current_medications.*.frequency' => 'required_with:metadata.health_declaration.current_medications|string|max:100',
            'metadata.health_declaration.allergies' => 'array',
            'metadata.health_declaration.allergies.*' => 'string|max:255',
            'metadata.health_declaration.family_history' => 'array',
            'metadata.health_declaration.family_history.*' => 'string|max:255',
            'metadata.health_declaration.smoker' => 'required|boolean',
            'metadata.health_declaration.alcohol_consumption' => 'required|string|in:none,occasional,regular',

            // Consent and Authorization
            'metadata.consent.data_processing' => 'required|accepted',
            'metadata.consent.health_data_sharing' => 'required|accepted',
            'metadata.consent.marketing_communications' => 'required|boolean',
            'metadata.consent.terms_of_service' => 'required|accepted',
            'metadata.consent.privacy_policy' => 'required|accepted',
            'metadata.consent.timestamp' => 'required|date',
            'metadata.consent.ip_address' => 'required|ip'
        ];
    }

    /**
     * Get custom messages for validator errors.
     *
     * @return array
     */
    public function messages(): array
    {
        return [
            // Personal Information Messages
            'metadata.personal_info.first_name.required' => __('validation.enrollment.first_name_required'),
            'metadata.personal_info.last_name.required' => __('validation.enrollment.last_name_required'),
            'metadata.personal_info.birth_date.required' => __('validation.enrollment.birth_date_required'),
            'metadata.personal_info.birth_date.before' => __('validation.enrollment.birth_date_invalid'),
            'metadata.personal_info.cpf.required' => __('validation.enrollment.cpf_required'),
            'metadata.personal_info.cpf.unique' => __('validation.enrollment.cpf_unique'),
            'metadata.personal_info.rg.required' => __('validation.enrollment.rg_required'),

            // Contact Information Messages
            'metadata.contact_info.email.required' => __('validation.enrollment.email_required'),
            'metadata.contact_info.email.email' => __('validation.enrollment.email_invalid'),
            'metadata.contact_info.phone_primary.required' => __('validation.enrollment.phone_required'),
            'metadata.contact_info.phone_primary.regex' => __('validation.enrollment.phone_invalid'),

            // Address Information Messages
            'metadata.address_info.street.required' => __('validation.enrollment.street_required'),
            'metadata.address_info.postal_code.required' => __('validation.enrollment.postal_code_required'),
            'metadata.address_info.postal_code.size' => __('validation.enrollment.postal_code_invalid'),

            // Health Declaration Messages
            'metadata.health_declaration.has_chronic_conditions.required' => __('validation.enrollment.chronic_conditions_required'),
            'metadata.health_declaration.chronic_conditions.required_if' => __('validation.enrollment.chronic_conditions_details_required'),
            'metadata.health_declaration.current_medications.*.name.required_with' => __('validation.enrollment.medication_name_required'),
            'metadata.health_declaration.current_medications.*.dosage.required_with' => __('validation.enrollment.medication_dosage_required'),

            // Consent Messages
            'metadata.consent.data_processing.required' => __('validation.enrollment.data_processing_consent_required'),
            'metadata.consent.data_processing.accepted' => __('validation.enrollment.data_processing_consent_accepted'),
            'metadata.consent.health_data_sharing.required' => __('validation.enrollment.health_data_consent_required'),
            'metadata.consent.health_data_sharing.accepted' => __('validation.enrollment.health_data_consent_accepted'),
            'metadata.consent.terms_of_service.required' => __('validation.enrollment.terms_consent_required'),
            'metadata.consent.terms_of_service.accepted' => __('validation.enrollment.terms_consent_accepted'),
            'metadata.consent.privacy_policy.required' => __('validation.enrollment.privacy_consent_required'),
            'metadata.consent.privacy_policy.accepted' => __('validation.enrollment.privacy_consent_accepted')
        ];
    }
}