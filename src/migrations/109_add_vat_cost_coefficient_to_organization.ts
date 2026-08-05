import pool from '../db.js';

export const runMigration = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE "Organization"
      ADD COLUMN IF NOT EXISTS "vatCostCoefficient" NUMERIC(6,4) DEFAULT 1.0;
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 109 applied: Added vatCostCoefficient column to Organization table');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 109 failed:', error);
    throw error;
  } finally {
    client.release();
  }
};
