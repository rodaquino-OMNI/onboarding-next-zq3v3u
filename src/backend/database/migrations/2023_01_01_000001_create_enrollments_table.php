<?php

use Illuminate\Database\Migrations\Migration; // ^9.0
use Illuminate\Database\Schema\Blueprint; // ^9.0
use Illuminate\Support\Facades\Schema; // ^9.0

class CreateEnrollmentsTable extends Migration
{
    /**
     * Run the migrations to create the enrollments table with HIPAA-compliant
     * structure and optimized indexes for healthcare enrollment workflow.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('enrollments', function (Blueprint $table) {
            // Primary identifier using UUID for HIPAA compliance
            $table->uuid('id')->primary();
            
            // Foreign key to users table with cascade delete
            $table->uuid('user_id');
            $table->foreign('user_id')
                  ->references('id')
                  ->on('users')
                  ->onDelete('cascade');

            // Enrollment status with validation constraint
            $table->string('status');
            $table->check('status in (
                "draft",
                "documents_pending",
                "documents_submitted",
                "health_declaration_pending",
                "interview_scheduled",
                "interview_completed",
                "completed",
                "cancelled"
            )');

            // Flexible JSON storage for additional enrollment data
            $table->json('metadata');

            // Timestamps for tracking and auditing
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
            $table->softDeletes(); // For HIPAA-compliant data retention

            // Indexes for optimized query performance
            $table->index('user_id');
            $table->index('status');
            $table->index('completed_at');
            $table->index(['user_id', 'status']); // Composite index for common queries
            $table->index('created_at');
            $table->index('updated_at');
            $table->index('deleted_at');
        });
    }

    /**
     * Reverse the migrations by dropping the enrollments table
     * and all associated constraints and indexes.
     *
     * @return void
     */
    public function down()
    {
        Schema::table('enrollments', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
        });

        Schema::dropIfExists('enrollments');
    }
}