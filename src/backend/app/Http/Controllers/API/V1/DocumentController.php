<?php

namespace App\Http\Controllers\API\V1;

use App\Http\Controllers\Controller;
use App\Models\Document;
use App\Http\Resources\API\V1\DocumentResource;
use App\Services\AWS\TextractService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

/**
 * API Controller for HIPAA-compliant document management operations
 * 
 * @package App\Http\Controllers\API\V1
 */
class DocumentController extends Controller
{
    /**
     * Allowed document MIME types
     */
    private const ALLOWED_MIME_TYPES = [
        'application/pdf',
        'image/jpeg',
        'image/png'
    ];

    /**
     * Maximum file size in bytes (10MB)
     */
    private const MAX_FILE_SIZE = 10485760;

    /**
     * Rate limiting configuration
     */
    private const RATE_LIMIT_KEY = 'document_upload';
    private const RATE_LIMIT_MAX_ATTEMPTS = 60;
    private const RATE_LIMIT_DECAY_MINUTES = 1;

    /**
     * @var TextractService
     */
    private TextractService $textractService;

    /**
     * Initialize controller with required services
     *
     * @param TextractService $textractService
     */
    public function __construct(TextractService $textractService)
    {
        $this->textractService = $textractService;

        $this->middleware(['auth:sanctum', 'throttle:60,1']);
        $this->middleware('security-headers');
    }

    /**
     * List documents for an enrollment with security filtering
     *
     * @param Request $request
     * @param string $enrollmentId
     * @return JsonResponse
     */
    public function index(Request $request, string $enrollmentId): JsonResponse
    {
        try {
            // Check rate limiting
            if (RateLimiter::tooManyAttempts(
                self::RATE_LIMIT_KEY . ':' . $request->ip(),
                self::RATE_LIMIT_MAX_ATTEMPTS
            )) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Too many requests'
                ], Response::HTTP_TOO_MANY_REQUESTS);
            }

            // Validate enrollment access
            $documents = Document::where('enrollment_id', $enrollmentId)
                ->whereHas('enrollment', function ($query) {
                    $query->where('user_id', auth()->id());
                })
                ->get();

            // Log access for HIPAA audit
            Log::channel('audit')->info('Documents accessed', [
                'user_id' => auth()->id(),
                'enrollment_id' => $enrollmentId,
                'ip_address' => $request->ip(),
                'document_count' => $documents->count()
            ]);

            return response()->json([
                'status' => 'success',
                'data' => DocumentResource::collection($documents)
            ], Response::HTTP_OK);

        } catch (\Exception $e) {
            Log::error('Document listing failed', [
                'error' => $e->getMessage(),
                'enrollment_id' => $enrollmentId
            ]);

            return response()->json([
                'status' => 'error',
                'message' => 'Failed to retrieve documents'
            ], Response::HTTP_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Store new document with HIPAA-compliant security measures
     *
     * @param Request $request
     * @return JsonResponse
     */
    public function store(Request $request): JsonResponse
    {
        try {
            // Validate request
            $validator = Validator::make($request->all(), [
                'enrollment_id' => 'required|uuid|exists:enrollments,id',
                'type' => 'required|string|in:' . implode(',', Document::DOCUMENT_TYPES),
                'file' => 'required|file|max:' . (self::MAX_FILE_SIZE / 1024) . '|mimes:pdf,jpeg,png'
            ]);

            if ($validator->fails()) {
                return response()->json([
                    'status' => 'error',
                    'errors' => $validator->errors()
                ], Response::HTTP_UNPROCESSABLE_ENTITY);
            }

            // Validate file security
            $file = $request->file('file');
            if (!$this->validateFile($file)) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Invalid file format or content'
                ], Response::HTTP_UNPROCESSABLE_ENTITY);
            }

            // Store file securely
            $storagePath = Storage::disk('s3')->putFile(
                'documents/' . $request->enrollment_id,
                $file,
                ['ServerSideEncryption' => 'AES256']
            );

            // Create document record
            $document = new Document([
                'enrollment_id' => $request->enrollment_id,
                'type' => $request->type,
                'storage_path' => $storagePath
            ]);
            $document->save();

            // Queue OCR processing
            dispatch(function () use ($document) {
                $this->textractService->processDocument($document);
            })->onQueue('ocr-processing');

            // Log document upload
            Log::channel('audit')->info('Document uploaded', [
                'document_id' => $document->id,
                'user_id' => auth()->id(),
                'enrollment_id' => $request->enrollment_id,
                'type' => $request->type,
                'ip_address' => $request->ip()
            ]);

            return response()->json([
                'status' => 'success',
                'data' => new DocumentResource($document)
            ], Response::HTTP_CREATED);

        } catch (ValidationException $e) {
            return response()->json([
                'status' => 'error',
                'errors' => $e->errors()
            ], Response::HTTP_UNPROCESSABLE_ENTITY);

        } catch (\Exception $e) {
            Log::error('Document upload failed', [
                'error' => $e->getMessage(),
                'user_id' => auth()->id()
            ]);

            return response()->json([
                'status' => 'error',
                'message' => 'Failed to upload document'
            ], Response::HTTP_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Get document OCR processing status with security validation
     *
     * @param string $id
     * @return JsonResponse
     */
    public function processOCR(string $id): JsonResponse
    {
        try {
            $document = Document::findOrFail($id);

            // Verify access authorization
            if (!$this->authorizeAccess($document)) {
                return response()->json([
                    'status' => 'error',
                    'message' => 'Unauthorized access'
                ], Response::HTTP_FORBIDDEN);
            }

            // Process document if not already processed
            if (!$document->isProcessed()) {
                $this->textractService->processDocument($document);
            }

            return response()->json([
                'status' => 'success',
                'data' => new DocumentResource($document)
            ], Response::HTTP_OK);

        } catch (\Exception $e) {
            Log::error('OCR processing failed', [
                'error' => $e->getMessage(),
                'document_id' => $id
            ]);

            return response()->json([
                'status' => 'error',
                'message' => 'OCR processing failed'
            ], Response::HTTP_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * Validate file security and content
     *
     * @param \Illuminate\Http\UploadedFile $file
     * @return bool
     */
    private function validateFile($file): bool
    {
        // Check MIME type
        if (!in_array($file->getMimeType(), self::ALLOWED_MIME_TYPES)) {
            return false;
        }

        // Check file size
        if ($file->getSize() > self::MAX_FILE_SIZE) {
            return false;
        }

        // Scan for malware (implement your scanning logic here)
        // ...

        return true;
    }

    /**
     * Authorize document access
     *
     * @param Document $document
     * @return bool
     */
    private function authorizeAccess(Document $document): bool
    {
        return $document->enrollment->user_id === auth()->id() ||
               auth()->user()->hasRole('admin');
    }
}