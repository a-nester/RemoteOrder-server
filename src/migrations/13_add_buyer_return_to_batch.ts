import pool from '../db.js';

export async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add buyerReturnId column to ProductBatch
    await client.query(`
      ALTER TABLE "ProductBatch" 
      ADD COLUMN IF NOT EXISTS "buyerReturnId" UUID REFERENCES "BuyerReturn"(id) ON DELETE SET NULL;
    `);

    // Optional: add an index for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS "idx_productbatch_buyerreturnid" ON "ProductBatch"("buyerReturnId");
    `);

    await client.query('COMMIT');
    console.log('Migration [add_buyer_return_to_batch] applied successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration [add_buyer_return_to_batch] failed:', err);
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
