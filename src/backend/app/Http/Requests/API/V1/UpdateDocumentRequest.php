<?php

namespace App\Http\Requests\API\V1;

use App\Models\Document;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Form request class for validating document update operations
 * with HIPAA compliance and enhanced security measures.
 */
class UpdateDocumentRequest extends FormRequest
{
    /**
     * Maximum allowed file size in bytes (50MB)
     */
    private const MAX_FILE_SIZE = 52428800;

    /**
     * Determine if the user is authorized to make this request.
     *
     * @return bool
     */
    public function authorize(): bool
    {
        $documentId = $this->route('document');
        $document = Document::findOrFail($documentId);

        // Check if user owns the document through enrollment
        $isOwner = $document->enrollment->user_id === auth()->id();
        
        // Check if user is an admin
        $isAdmin = auth()->user()->hasRole('admin');

        // Log authorization attempt for audit
        activity()
            ->performedOn($document)
            ->withProperties([
                'user_id' => auth()->id(),
                'is_owner' => $isOwner,
                'is_admin' => $isAdmin,
                'ip_address' => request()->ip()
            ])
            ->log('document_update_authorization');

        return $isOwner || $isAdmin;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'type' => [
                'sometimes',
                'required',
                'string',
                Rule::in(Document::DOCUMENT_TYPES)
            ],
            'file' => [
                'sometimes',
                'required',
                'file',
                'max:' . (self::MAX_FILE_SIZE / 1024), // Convert to KB for validation
                'mimes:pdf,jpg,jpeg,png',
            ],
            'storage_path' => [
                'sometimes',
                'required',
                'string',
                'regex:/^[\w\-\/\.]+$/', // Alphanumeric with basic special chars
                'max:255'
            ],
            'ocr_data' => [
                'sometimes',
                'required',
                'array'
            ],
            'ocr_data.confidence' => [
                'required_with:ocr_data',
                'numeric',
                'between:0,1'
            ],
            'ocr_data.data' => [
                'required_with:ocr_data',
                'array'
            ],
            'ocr_data.data.*.type' => [
                'required',
                'string'
            ],
            'ocr_data.data.*.value' => [
                'required',
                'string',
                'max:1000'
            ],
            'ocr_data.data.*.confidence' => [
                'required',
                'numeric',
                'between:0,1'
            ]
        ];
    }

    /**
     * Get custom messages for validator errors.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'type.in' => 'The selected document type is not valid for healthcare enrollment.',
            'file.max' => 'The document file size must not exceed 50MB for HIPAA compliance.',
            'file.mimes' => 'Only PDF and image files (JPG, JPEG, PNG) are allowed for healthcare documents.',
            'storage_path.regex' => 'The storage path contains invalid characters that may pose a security risk.',
            'ocr_data.confidence.between' => 'OCR confidence score must be between 0 and 1 for accurate document processing.',
            'ocr_data.data.*.value.max' => 'OCR extracted text exceeds maximum allowed length for secure processing.',
            'ocr_data.data.*.confidence.between' => 'Individual OCR field confidence must be between 0 and 1.'
        ];
    }

    /**
     * Prepare the data for validation.
     *
     * @return void
     */
    protected function prepareForValidation(): void
    {
        // Sanitize input data
        if ($this->has('type')) {
            $this->merge([
                'type' => strip_tags($this->type)
            ]);
        }

        if ($this->has('storage_path')) {
            $this->merge([
                'storage_path' => strip_tags($this->storage_path)
            ]);
        }

        // Format OCR data structure if present
        if ($this->has('ocr_data') && is_array($this->ocr_data)) {
            $sanitizedOcrData = $this->sanitizeOcrData($this->ocr_data);
            $this->merge(['ocr_data' => $sanitizedOcrData]);
        }

        // Log validation preparation for audit
        activity()
            ->withProperties([
                'request_id' => request()->id(),
                'input_fields' => array_keys($this->all())
            ])
            ->log('document_update_validation_prepared');
    }

    /**
     * Sanitize OCR data array recursively.
     *
     * @param array $data
     * @return array
     */
    private function sanitizeOcrData(array $data): array
    {
        $sanitized = [];
        foreach ($data as $key => $value) {
            if (is_array($value)) {
                $sanitized[$key] = $this->sanitizeOcrData($value);
            } elseif (is_string($value)) {
                $sanitized[$key] = strip_tags($value);
            } else {
                $sanitized[$key] = $value;
            }
        }
        return $sanitized;
    }
}