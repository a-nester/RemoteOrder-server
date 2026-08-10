import pool from '../db.js';

export const runMigration = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create Territory table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Territory" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" VARCHAR(255) NOT NULL UNIQUE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Add territoryId to Counterparty table
    await client.query(`
      ALTER TABLE "Counterparty" 
      ADD COLUMN IF NOT EXISTS "territoryId" UUID REFERENCES "Territory"("id") ON DELETE SET NULL;
    `);

    // 3. Add visibleTerritories to User table
    await client.query(`
      ALTER TABLE "User" 
      ADD COLUMN IF NOT EXISTS "visibleTerritories" JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);

    await client.query('COMMIT');
    console.log('✅ Migration 111 applied: Created Territory table, added territoryId to Counterparty, added visibleTerritories to User');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 111 failed:', error);
    throw error;
  } finally {
    client.release();
  }
};
