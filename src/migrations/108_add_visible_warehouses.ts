import pool from '../db.js';

export const runMigration = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE "User"
      ADD COLUMN IF NOT EXISTS "visibleWarehouses" JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 108 applied: Added visibleWarehouses column to User table');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 108 failed:', error);
    throw error;
  } finally {
    client.release();
  }
};
