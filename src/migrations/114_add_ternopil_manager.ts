import pool from '../db.js';
import bcrypt from 'bcryptjs';

export const runMigration = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Ensure 'Тернопіль' territory exists
    let territoryId: string;
    const terrRes = await client.query('SELECT id FROM "Territory" WHERE name = $1', ['Тернопіль']);
    if (terrRes.rows.length > 0) {
      territoryId = terrRes.rows[0].id;
    } else {
      const newTerr = await client.query(
        'INSERT INTO "Territory" (name, "createdAt", "updatedAt") VALUES ($1, NOW(), NOW()) RETURNING id',
        ['Тернопіль']
      );
      territoryId = newTerr.rows[0].id;
      console.log('✅ Created territory: Тернопіль');
    }

    // 2. Ensure manager ternopil@test.com exists
    const email = 'ternopil@test.com';
    const userRes = await client.query('SELECT id FROM "User" WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('123456', 10);
      await client.query(
        `INSERT INTO "User" (email, password, role, "visibleTerritories", "createdAt", "updatedAt")
         VALUES ($1, $2, 'manager', $3, NOW(), NOW())`,
        [email, hashedPassword, JSON.stringify([territoryId])]
      );
      console.log(`✅ Created manager user: ${email}`);
    } else {
      // Update visibleTerritories to include territoryId if missing
      const userId = userRes.rows[0].id;
      await client.query(
        `UPDATE "User" 
         SET "visibleTerritories" = COALESCE("visibleTerritories", '[]'::jsonb) || $1::jsonb
         WHERE id = $2 AND NOT ("visibleTerritories" @> $1::jsonb)`,
        [JSON.stringify([territoryId]), userId]
      );
    }

    await client.query('COMMIT');
    console.log('✅ Migration 114 applied: Added ternopil@test.com manager and territory');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 114 failed:', error);
    throw error;
  } finally {
    client.release();
  }
};
