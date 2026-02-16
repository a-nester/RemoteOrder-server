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
        
        const testOrderId = 'test-order-001';
        
        // Check if exists
        const res = await client.query('SELECT id FROM "Order" WHERE id = $1', [testOrderId]);
        if (res.rows.length === 0) {
            console.log("Inserting test order...");
            await client.query(`
                INSERT INTO "Order" ("id", "userId", "status", "total", "currency", "items", "createdAt", "updatedAt")
                VALUES ($1, $2, 'NEW', 100.00, 'UAH', '[]', NOW(), NOW())
            `, [testOrderId, '1']);
            await client.query('COMMIT');
            console.log("✅ Test order inserted.");
        } else {
            console.log("Test order already exists.");
            await client.query('ROLLBACK');
        }
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("❌ Error inserting test order:", e);
    } finally {
        client.release();
        pool.end();
    }
})();
