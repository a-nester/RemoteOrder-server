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
        
        console.log("Fetching dependencies (Counterparty, Warehouse)...");
        const cpRes = await client.query('SELECT id, "warehouseId" FROM "Counterparty" LIMIT 1');
        if (cpRes.rows.length === 0) {
             console.log("Skipping test: No counterparties found.");
             await client.query('ROLLBACK');
             return;
        }
        const cp = cpRes.rows[0];
        
        const whRes = await client.query('SELECT id FROM "Warehouse" LIMIT 1');
        if (whRes.rows.length === 0) {
             console.log("Skipping test: No warehouses found.");
             await client.query('ROLLBACK');
             return;
        }
        const warehouseId = cp.warehouseId || whRes.rows[0].id;
        
        const number = `TEST-${Date.now()}`;
        const userId = 'system-test-user'; 
        
        console.log("Testing Realization INSERT...");
        await client.query(`
            INSERT INTO "Realization" (
                "date", "number", "counterpartyId", "warehouseId", "status", "amount", "currency", "createdBy"
            ) VALUES (
               NOW(), $1, $2, $3, 'DRAFT', $4, $5, $6
            ) RETURNING id
        `, [number, cp.id, warehouseId, 100.00, 'UAH', userId]);
        
        console.log("✅ Insert successful (Verification Passed)");
        
        await client.query('ROLLBACK');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("❌ Error verifying realization insert:", e);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
})();
