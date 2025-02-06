<?php

use Illuminate\Database\Migrations\Migration; // ^9.0
use Illuminate\Database\Schema\Blueprint; // ^9.0
use Illuminate\Support\Facades\Schema; // ^9.0

class CreatePersonalAccessTokensTable extends Migration
{
    /**
     * Run the migrations to create the personal_access_tokens table.
     * This table supports secure API authentication using Laravel Sanctum
     * with comprehensive audit capabilities for healthcare data compliance.
     *
     * @return void
     */
    public function up()
    {
        Schema::create('personal_access_tokens', function (Blueprint $table) {
            // Primary key with unsigned big integer for large scale support
            $table->bigIncrements('id');

            // Polymorphic relationship columns for flexible token ownership
            // with index for efficient lookups
            $table->morphs('tokenable');

            // Token name/purpose identifier
            $table->string('name');

            // Token hash storage using SHA-256 (64 chars) with unique constraint
            // for security and collision prevention
            $table->string('token', 64)->unique();

            // JSON array of token abilities/permissions for granular access control
            $table->text('abilities')->nullable();

            // High precision timestamp for detailed audit logging
            $table->timestamp('last_used_at', 6)->nullable();

            // Standard timestamps for record lifecycle tracking
            $table->timestamps();

            // Create composite index on tokenable columns for query performance
            $table->index(['tokenable_type', 'tokenable_id'], 'pat_tokenable_index');
        });
    }

    /**
     * Reverse the migrations by dropping the personal_access_tokens table
     * and all associated indexes.
     *
     * @return void
     */
    public function down()
    {
        Schema::dropIfExists('personal_access_tokens');
    }
}