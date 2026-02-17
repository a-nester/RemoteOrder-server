import pool from './db';

const migrate = async () => {
    const client = await pool.connect();
    try {
        console.log('Migrating v6: Adding isDeleted to Order table...');

        // Add isDeleted column
        await client.query(`
      ALTER TABLE "Order" 
      ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN DEFAULT FALSE;
    `);

        // Add index for performance
        await client.query(`
      CREATE INDEX IF NOT EXISTS "idx_order_isDeleted" ON "Order" ("isDeleted");
    `);

        console.log('Migration v6 completed successfully');
    } catch (err) {
        console.error('Migration v6 failed:', err);
    } finally {
        client.release();
        process.exit(0); // Ensure script exits
    }
};

migrate();
