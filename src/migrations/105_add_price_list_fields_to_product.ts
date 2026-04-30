import pool from '../db.js';

export const runMigration = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE "Product"
      ADD COLUMN IF NOT EXISTS "barcode" TEXT,
      ADD COLUMN IF NOT EXISTS "packing" TEXT,
      ADD COLUMN IF NOT EXISTS "tara" TEXT;
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 105 applied: Added barcode, packing, tara columns to Product table');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 105 failed:', error);
    throw error;
  } finally {
    client.release();
  }
};
