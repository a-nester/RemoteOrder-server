import pool from '../db.js';

export const runMigration = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Add userId column to collection_schedule table
    await client.query(`
      ALTER TABLE collection_schedule 
      ADD COLUMN IF NOT EXISTS "userId" TEXT;
    `);

    // 2. Create index on userId for fast query filtering
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_collection_schedule_user_id ON collection_schedule("userId");
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 112 applied: Added userId column to collection_schedule table');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 112 failed:', error);
    throw error;
  } finally {
    client.release();
  }
};
