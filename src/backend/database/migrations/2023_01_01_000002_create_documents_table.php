<?php

use Illuminate\Database\Migrations\Migration; // ^9.0
use Illuminate\Database\Schema\Blueprint; // ^9.0
use Illuminate\Support\Facades\Schema; // ^9.0

class CreateDocumentsTable extends Migration
{
    /**
     * Run the migrations to create the documents table with comprehensive
     * support for secure document storage, OCR processing, and HIPAA compliance.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('documents', function (Blueprint $table) {
            // Primary identifier using UUID for enhanced security
            $table->uuid('id')->primary();

            // Foreign key to enrollments with cascade delete
            $table->uuid('enrollment_id');
            $table->foreign('enrollment_id')
                  ->references('id')
                  ->on('enrollments')
                  ->onDelete('cascade');

            // Document type with validation constraints
            $table->string('type');
            $table->check('type IN (
                "id_document",
                "proof_of_address",
                "health_declaration",
                "medical_record"
            )');

            // Secure storage path for encrypted documents
            $table->string('storage_path')->unique();

            // OCR processing data storage
            $table->json('ocr_data')->nullable();
            $table->timestamp('processed_at')->nullable();

            // Audit trail timestamps
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->useCurrentOnUpdate();
            $table->softDeletes();

            // Performance optimization indexes
            $table->index('enrollment_id');
            $table->index('type');
            $table->index('processed_at');
            $table->index('created_at');
            $table->index('updated_at');
            $table->index('deleted_at');
        });

        // Add table comment for documentation
        DB::statement('ALTER TABLE `documents` COMMENT "Secure storage for HIPAA-compliant healthcare enrollment documents with OCR processing capabilities"');
    }

    /**
     * Reverse the migrations by dropping the documents table
     * and all associated constraints.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('documents');
    }
}