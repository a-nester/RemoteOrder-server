import pool from '../db.js';

export const runMigration = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE "Organization"
      ADD COLUMN IF NOT EXISTS "categories" JSONB DEFAULT NULL;
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 107 applied: Added categories column to Organization table');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 107 failed:', error);
    throw error;
  } finally {
    client.release();
  }
};
