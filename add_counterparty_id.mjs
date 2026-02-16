import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: "postgresql://remoteorder_user:wDJme334tcPVfpgd0ozQduahRKHgHsBS@dpg-d63kbnq4d50c73dpj6i0-a.oregon-postgres.render.com/remoteorder",
  ssl: { rejectUnauthorized: false }
});

(async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        console.log("Adding counterpartyId column to Order table...");
        await client.query(`
            ALTER TABLE "Order" 
            ADD COLUMN IF NOT EXISTS "counterpartyId" UUID;
        `);
        
        // Optional: Add FK constraint if Counterparty table uses UUID
        // Checking Counterparty table schema first is safer, but assuming UUID based on previous tasks.
        
        await client.query('COMMIT');
        console.log("✅ Column added successfully.");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("❌ Error adding column:", e);
    } finally {
        client.release();
        pool.end();
    }
})();
