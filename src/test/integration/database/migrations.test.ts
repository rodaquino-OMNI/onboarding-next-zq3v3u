import { describe, beforeEach, afterEach, it, expect } from 'jest'; // ^29.0.0
import knex, { Knex } from 'knex'; // ^2.4.0
import { cleanDatabase } from '../../utils/db-cleaner';

// Test database configuration
const TEST_DB_CONFIG: Knex.Config = {
  client: 'mysql2',
  connection: {
    host: process.env.TEST_DB_HOST || 'localhost',
    port: Number(process.env.TEST_DB_PORT) || 3306,
    user: process.env.TEST_DB_USER || 'test_user',
    password: process.env.TEST_DB_PASSWORD || 'test_password',
    database: process.env.TEST_DB_NAME || 'austa_test',
    charset: 'utf8mb4'
  },
  pool: {
    min: 1,
    max: 10
  },
  migrations: {
    directory: './database/migrations'
  }
};

let db: Knex;

async function setupTestDatabase(): Promise<void> {
  db = knex(TEST_DB_CONFIG);
  
  // Set strict transaction isolation for test consistency
  await db.raw('SET SESSION TRANSACTION ISOLATION LEVEL SERIALIZABLE');
  
  // Run migrations to latest version
  await db.migrate.latest();
  
  // Clean database state
  await cleanDatabase(db);
}

async function teardownTestDatabase(): Promise<void> {
  if (db) {
    await db.migrate.rollback(undefined, true);
    await db.destroy();
  }
}

describe('Database Migrations', () => {
  beforeEach(async () => {
    await setupTestDatabase();
  });

  afterEach(async () => {
    await teardownTestDatabase();
  });

  describe('Users Table', () => {
    it('should create users table with correct schema', async () => {
      const hasTable = await db.schema.hasTable('users');
      expect(hasTable).toBe(true);

      const tableInfo = await db.table('users').columnInfo();
      
      // Verify primary key
      expect(tableInfo.id).toEqual({
        type: 'char',
        maxLength: 36,
        nullable: false,
        defaultValue: null
      });

      // Verify email column
      expect(tableInfo.email).toEqual({
        type: 'varchar',
        maxLength: 255,
        nullable: false,
        defaultValue: null
      });

      // Verify password column
      expect(tableInfo.password_hash).toEqual({
        type: 'varchar',
        maxLength: 255,
        nullable: false,
        defaultValue: null
      });

      // Verify timestamps
      expect(tableInfo.created_at).toBeDefined();
      expect(tableInfo.updated_at).toBeDefined();
    });

    it('should enforce unique email constraint', async () => {
      await expect(db('users').insert([
        { id: '1', email: 'test@example.com', password_hash: 'hash1' },
        { id: '2', email: 'test@example.com', password_hash: 'hash2' }
      ])).rejects.toThrow();
    });
  });

  describe('Enrollments Table', () => {
    it('should create enrollments table with correct schema', async () => {
      const hasTable = await db.schema.hasTable('enrollments');
      expect(hasTable).toBe(true);

      const tableInfo = await db.table('enrollments').columnInfo();
      
      // Verify primary key
      expect(tableInfo.id).toEqual({
        type: 'char',
        maxLength: 36,
        nullable: false,
        defaultValue: null
      });

      // Verify foreign key
      expect(tableInfo.user_id).toEqual({
        type: 'char',
        maxLength: 36,
        nullable: false,
        defaultValue: null
      });

      // Verify status column
      expect(tableInfo.status).toEqual({
        type: 'enum',
        maxLength: 65535,
        nullable: false,
        defaultValue: 'pending'
      });

      // Verify metadata column
      expect(tableInfo.metadata).toEqual({
        type: 'json',
        maxLength: null,
        nullable: true,
        defaultValue: null
      });
    });

    it('should enforce foreign key constraint with users table', async () => {
      await expect(db('enrollments').insert({
        id: '1',
        user_id: 'non-existent-user',
        status: 'pending'
      })).rejects.toThrow();
    });
  });

  describe('Documents Table', () => {
    it('should create documents table with correct schema', async () => {
      const hasTable = await db.schema.hasTable('documents');
      expect(hasTable).toBe(true);

      const tableInfo = await db.table('documents').columnInfo();
      
      // Verify primary key
      expect(tableInfo.id).toEqual({
        type: 'char',
        maxLength: 36,
        nullable: false,
        defaultValue: null
      });

      // Verify foreign key
      expect(tableInfo.enrollment_id).toEqual({
        type: 'char',
        maxLength: 36,
        nullable: false,
        defaultValue: null
      });

      // Verify document type column
      expect(tableInfo.type).toEqual({
        type: 'enum',
        maxLength: 65535,
        nullable: false,
        defaultValue: null
      });

      // Verify storage path column
      expect(tableInfo.storage_path).toEqual({
        type: 'varchar',
        maxLength: 255,
        nullable: false,
        defaultValue: null
      });

      // Verify OCR data column
      expect(tableInfo.ocr_data).toEqual({
        type: 'json',
        maxLength: null,
        nullable: true,
        defaultValue: null
      });
    });
  });

  describe('Health Records Table', () => {
    it('should create health_records table with correct schema', async () => {
      const hasTable = await db.schema.hasTable('health_records');
      expect(hasTable).toBe(true);

      const tableInfo = await db.table('health_records').columnInfo();
      
      // Verify primary key
      expect(tableInfo.id).toEqual({
        type: 'char',
        maxLength: 36,
        nullable: false,
        defaultValue: null
      });

      // Verify foreign key
      expect(tableInfo.enrollment_id).toEqual({
        type: 'char',
        maxLength: 36,
        nullable: false,
        defaultValue: null
      });

      // Verify encrypted health data column
      expect(tableInfo.health_data).toEqual({
        type: 'json',
        maxLength: null,
        nullable: false,
        defaultValue: null
      });

      // Verify verification status
      expect(tableInfo.verified).toEqual({
        type: 'boolean',
        maxLength: null,
        nullable: false,
        defaultValue: '0'
      });
    });

    it('should enforce encryption on health data', async () => {
      const record = await db('health_records').insert({
        id: '1',
        enrollment_id: '1',
        health_data: { condition: 'test' },
        verified: false
      }).returning('health_data');

      // Verify data is encrypted (not plaintext)
      expect(typeof record[0].health_data).toBe('string');
      expect(record[0].health_data).not.toContain('test');
    });
  });

  describe('Interviews Table', () => {
    it('should create interviews table with correct schema', async () => {
      const hasTable = await db.schema.hasTable('interviews');
      expect(hasTable).toBe(true);

      const tableInfo = await db.table('interviews').columnInfo();
      
      // Verify primary key
      expect(tableInfo.id).toEqual({
        type: 'char',
        maxLength: 36,
        nullable: false,
        defaultValue: null
      });

      // Verify foreign keys
      expect(tableInfo.enrollment_id).toEqual({
        type: 'char',
        maxLength: 36,
        nullable: false,
        defaultValue: null
      });

      expect(tableInfo.interviewer_id).toEqual({
        type: 'char',
        maxLength: 36,
        nullable: false,
        defaultValue: null
      });

      // Verify scheduling columns
      expect(tableInfo.scheduled_at).toEqual({
        type: 'datetime',
        maxLength: null,
        nullable: false,
        defaultValue: null
      });

      // Verify video URL column
      expect(tableInfo.video_url).toEqual({
        type: 'varchar',
        maxLength: 255,
        nullable: true,
        defaultValue: null
      });
    });

    it('should prevent scheduling conflicts', async () => {
      const time = new Date();
      await db('interviews').insert({
        id: '1',
        enrollment_id: '1',
        interviewer_id: '1',
        scheduled_at: time
      });

      await expect(db('interviews').insert({
        id: '2',
        enrollment_id: '2',
        interviewer_id: '1',
        scheduled_at: time
      })).rejects.toThrow();
    });
  });
});