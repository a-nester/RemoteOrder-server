import pool from '../db.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add organizationId column to Counterparty
    await client.query(`
      ALTER TABLE "Counterparty" 
      ADD COLUMN IF NOT EXISTS "organizationId" UUID REFERENCES "Organization"(id) ON DELETE SET NULL;
    `);

    // Optional: add an index for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS "idx_counterparty_organizationid" ON "Counterparty"("organizationId");
    `);

    await client.query('COMMIT');
    console.log('Migration [add_org_to_counterparty] applied successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration [add_org_to_counterparty] failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Allow running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  up()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
