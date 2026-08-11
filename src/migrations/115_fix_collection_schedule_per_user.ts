import pool from '../db.js';

export const runMigration = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get default admin user ID to assign legacy NULL schedule items
    const adminRes = await client.query('SELECT id FROM "User" WHERE role = \'admin\' ORDER BY id ASC LIMIT 1');
    const adminId = adminRes.rows.length > 0 ? String(adminRes.rows[0].id) : null;

    if (adminId) {
      // Backfill any NULL userId rows in collection_schedule to adminId so schedule items are isolated
      await client.query(
        `UPDATE collection_schedule SET "userId" = $1 WHERE "userId" IS NULL`,
        [adminId]
      );
      console.log(`✅ Migration 115 applied: Backfilled legacy collection_schedule NULL userId records to admin (${adminId})`);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 115 failed:', error);
    throw error;
  } finally {
    client.release();
  }
};
