<?php

use Illuminate\Database\Migrations\Migration; // ^9.0
use Illuminate\Database\Schema\Blueprint; // ^9.0
use Illuminate\Support\Facades\Schema; // ^9.0

class CreateHealthRecordsTable extends Migration
{
    /**
     * Run the migrations to create the health_records table with HIPAA-compliant
     * encryption support and comprehensive audit trail.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('health_records', function (Blueprint $table) {
            // Primary identifier using UUID for enhanced security
            $table->uuid('id')->primary();

            // Foreign key to enrollments with cascade delete
            $table->uuid('enrollment_id');
            $table->foreign('enrollment_id')
                  ->references('id')
                  ->on('enrollments')
                  ->onDelete('cascade');

            // Encrypted JSON column for PHI data using AES-256-GCM
            $table->json('health_data')
                  ->comment('AES-256-GCM encrypted health declaration data');

            // Verification status with index for filtering
            $table->boolean('verified')
                  ->default(false)
                  ->index();

            // Submission timestamp with index for tracking
            $table->timestamp('submitted_at')
                  ->nullable()
                  ->index();

            // Audit trail timestamps
            $table->timestamps();
            
            // Soft deletes for HIPAA-compliant data retention
            $table->softDeletes();

            // Composite indexes for common query patterns
            $table->index(['enrollment_id', 'verified'], 
                         'health_records_enrollment_id_verified_index');
            $table->index(['submitted_at'], 
                         'health_records_submitted_at_index');
            $table->index(['created_at', 'updated_at', 'deleted_at'], 
                         'health_records_audit_trail_index');
        });

        // Add table comment for documentation
        DB::statement('ALTER TABLE `health_records` COMMENT = "HIPAA-compliant health declarations and medical history with encryption"');
    }

    /**
     * Reverse the migrations by dropping the health_records table
     * and all associated indexes.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('health_records');
    }
}