import pool from '../db.js';

export const runMigration = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add inBox column to Product table
    await client.query(`
      ALTER TABLE "Product"
      ADD COLUMN IF NOT EXISTS "inBox" NUMERIC(10, 3) NULL;
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 104 applied: Added inBox column to Product table');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 104 failed:', error);
    throw error;
  } finally {
    client.release();
  }
};
