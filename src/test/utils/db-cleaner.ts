import knex, { Knex } from 'knex'; // ^2.4.0

// Tables in order of dependency (child to parent) to respect foreign key constraints
const TABLE_NAMES = [
  'interviews',
  'health_records',
  'documents',
  'enrollments',
  'users',
  'personal_access_tokens'
] as const;

/**
 * Custom error class for database cleaning operations
 */
class DatabaseCleaningError extends Error {
  constructor(
    message: string,
    public readonly tableName?: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'DatabaseCleaningError';
  }
}

/**
 * Truncates a single database table with proper error handling
 * @param db - Knex database instance
 * @param tableName - Name of the table to truncate
 * @throws {DatabaseCleaningError} If truncation fails
 */
async function truncateTable(db: Knex, tableName: string): Promise<void> {
  try {
    // Verify table exists before attempting truncation
    const tableExists = await db.schema.hasTable(tableName);
    if (!tableExists) {
      throw new DatabaseCleaningError(`Table ${tableName} does not exist`, tableName);
    }

    // Execute truncate command
    await db.raw(`TRUNCATE TABLE \`${tableName}\``);
    
    // Reset auto-increment counter
    await db.raw(`ALTER TABLE \`${tableName}\` AUTO_INCREMENT = 1`);
    
  } catch (error) {
    if (error instanceof DatabaseCleaningError) {
      throw error;
    }
    
    throw new DatabaseCleaningError(
      `Failed to truncate table ${tableName}`,
      tableName,
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

/**
 * Cleans all database tables in the correct order while respecting foreign key constraints
 * @param db - Knex database instance
 * @throws {DatabaseCleaningError} If cleaning operation fails
 */
export async function cleanDatabase(db: Knex): Promise<void> {
  // Start transaction for atomic operation
  const trx = await db.transaction();
  
  try {
    // Disable foreign key checks temporarily
    await trx.raw('SET FOREIGN_KEY_CHECKS = 0');

    // Truncate all tables in reverse dependency order
    for (const tableName of TABLE_NAMES) {
      await truncateTable(trx, tableName);
    }

    // Re-enable foreign key checks
    await trx.raw('SET FOREIGN_KEY_CHECKS = 1');

    // Commit transaction
    await trx.commit();

  } catch (error) {
    // Rollback transaction on any error
    await trx.rollback();

    // Ensure foreign key checks are re-enabled even after error
    try {
      await db.raw('SET FOREIGN_KEY_CHECKS = 1');
    } catch (fkError) {
      console.error('Failed to re-enable foreign key checks:', fkError);
    }

    if (error instanceof DatabaseCleaningError) {
      throw error;
    }

    throw new DatabaseCleaningError(
      'Database cleaning operation failed',
      undefined,
      error instanceof Error ? error : new Error(String(error))
    );
  }
}