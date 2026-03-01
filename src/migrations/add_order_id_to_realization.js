import pool from '../db.js';
async function migrate() {
    console.log('Running migration: Add orderId to Realization table...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Add orderId column to Realization table
        await client.query(`
            ALTER TABLE "Realization"
            ADD COLUMN IF NOT EXISTS "orderId" TEXT REFERENCES "Order"("id") ON DELETE SET NULL;
        `);
        // Index the foreign key for performance
        await client.query(`
            CREATE INDEX IF NOT EXISTS "Realization_orderId_idx" ON "Realization"("orderId");
        `);
        await client.query('COMMIT');
        console.log('Migration successful: orderId added to Realization table.');
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
        process.exit(1);
    }
    finally {
        client.release();
        process.exit(0);
    }
}
migrate();
