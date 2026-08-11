import pool from '../db.js';

export const runMigration = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add visiblePriceTypes column to User table
    await client.query(`
      ALTER TABLE "User" 
      ADD COLUMN IF NOT EXISTS "visiblePriceTypes" JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 113 applied: Added visiblePriceTypes column to User table');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 113 failed:', error);
    throw error;
  } finally {
    client.release();
  }
};
