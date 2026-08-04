import pool from '../db.js';

export const runMigration = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE "Product"
      ADD COLUMN IF NOT EXISTS "weight" DECIMAL(10,3) DEFAULT NULL;
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 106 applied: Added weight column to Product table');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 106 failed:', error);
    throw error;
  } finally {
    client.release();
  }
};
