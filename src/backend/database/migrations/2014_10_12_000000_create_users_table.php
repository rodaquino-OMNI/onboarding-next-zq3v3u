<?php

use Illuminate\Database\Migrations\Migration; // ^9.0
use Illuminate\Database\Schema\Blueprint; // ^9.0
use Illuminate\Support\Facades\Schema; // ^9.0

class CreateUsersTable extends Migration
{
    /**
     * Run the migrations to create the users table with comprehensive support for
     * role-based access control, multi-language preferences, and security features.
     *
     * @return void
     */
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            // Set table character set and collation for proper UTF-8 support
            $table->charset = 'utf8mb4';
            $table->collation = 'utf8mb4_unicode_ci';

            // Primary identifier using UUID for enhanced security
            $table->uuid('id')->primary();

            // Basic user information
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');

            // Role-based access control with valid role constraints
            $table->string('role')
                  ->default('individual')
                  ->comment('User role: individual, broker, interviewer, admin');
            
            // Add check constraint for valid roles (MySQL 8.0+ required)
            $table->rawIndex(
                "(case when role in ('individual', 'broker', 'interviewer', 'admin') then 1 end)",
                'users_role_check'
            );

            // Multi-language support with ISO language code
            $table->string('language', 5)
                  ->default('en')
                  ->comment('ISO 639-1 language code');

            // JSON column for flexible user preferences storage
            $table->json('preferences')
                  ->nullable()
                  ->comment('User preferences including UI settings, notifications, etc.');

            // Security and verification features
            $table->timestamp('email_verified_at')
                  ->nullable()
                  ->comment('Timestamp of email verification');
            $table->string('remember_token', 100)
                  ->nullable()
                  ->comment('Token for "remember me" session persistence');

            // Audit trail timestamps
            $table->timestamps();

            // Soft deletes for GDPR compliance
            $table->softDeletes()
                  ->comment('Soft delete timestamp for data retention compliance');

            // Indexes for query optimization
            $table->index(['role', 'email'], 'users_role_email_index');
            $table->index('deleted_at', 'users_deleted_at_index');

            // Add full text search capability for name and email
            $table->fullText(['name', 'email'], 'users_fulltext_search');
        });

        // Add a trigger to automatically generate UUID before insert
        DB::unprepared('
            CREATE TRIGGER users_before_insert BEFORE INSERT ON users
            FOR EACH ROW
            BEGIN
                IF NEW.id IS NULL THEN
                    SET NEW.id = UUID();
                END IF;
            END
        ');
    }

    /**
     * Reverse the migrations by dropping the users table and related objects.
     *
     * @return void
     */
    public function down(): void
    {
        // Drop the UUID trigger first
        DB::unprepared('DROP TRIGGER IF EXISTS users_before_insert');

        // Drop the users table
        Schema::dropIfExists('users');
    }
}