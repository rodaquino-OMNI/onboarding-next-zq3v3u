<?php

use Illuminate\Database\Migrations\Migration; // ^9.0
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema; // ^9.0

class CreateInterviewsTable extends Migration
{
    /**
     * Run the migrations to create the interviews table.
     * This table stores medical interview sessions with video conferencing capabilities,
     * supporting scheduling, status tracking, and notes management while ensuring HIPAA compliance.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('interviews', function (Blueprint $table) {
            // Primary key
            $table->uuid('id')->primary();
            
            // Foreign keys
            $table->uuid('enrollment_id');
            $table->foreign('enrollment_id')
                  ->references('id')
                  ->on('enrollments')
                  ->onDelete('cascade');
                  
            $table->uuid('interviewer_id');
            $table->foreign('interviewer_id')
                  ->references('id')
                  ->on('users')
                  ->onDelete('cascade');
            
            // Status tracking
            $table->enum('status', [
                'scheduled',
                'in_progress',
                'completed',
                'cancelled',
                'rescheduled'
            ])->default('scheduled');
            
            // Scheduling
            $table->timestamp('scheduled_at');
            $table->timestamp('started_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            
            // Video conferencing
            $table->string('video_provider')->default('vonage');
            $table->string('video_session_id')->unique()->nullable();
            $table->string('video_token')->nullable();
            
            // Interview data
            $table->json('notes')->nullable();
            $table->json('metadata')->nullable();
            
            // Record management
            $table->timestamps();
            $table->softDeletes();
            
            // Indexes for performance optimization
            $table->index('status');
            $table->index('scheduled_at');
            $table->index(['enrollment_id', 'status']);
            $table->index('interviewer_id');
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('interviews');
    }
}