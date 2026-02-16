import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: "postgresql://remoteorder_user:wDJme334tcPVfpgd0ozQduahRKHgHsBS@dpg-d63kbnq4d50c73dpj6i0-a.oregon-postgres.render.com/remoteorder",
  ssl: { rejectUnauthorized: false }
});

(async () => {
    const client = await pool.connect();
    try {
        const orderId = 'ac6fc877-d885-4f1a-84f8-3697e0c7236a';
        const counterpartyId = 'b5f648dd-3904-4fcf-bf6d-f4c1c95c0535';

        // 1. Check Counterparty
        const cpRes = await client.query(`SELECT id, name FROM "Counterparty" WHERE id = $1`, [counterpartyId]);
        
        if (cpRes.rows.length > 0) {
            console.log(`Counterparty Found: ${cpRes.rows[0].name}`);
            
            // 2. Update Order
            const updateRes = await client.query(`UPDATE "Order" SET "counterpartyId" = $1 WHERE id = $2 RETURNING *`, [counterpartyId, orderId]);
            console.log("Order Updated:", updateRes.rows[0]);
        } else {
             console.log("Counterparty NOT FOUND. Cannot patch.");
             // List available for debugging
             const allCps = await client.query(`SELECT id, name FROM "Counterparty" LIMIT 5`);
             console.log("Available:", allCps.rows);
        }

    } catch (e) {
        console.error("Error:", e);
    } finally {
        client.release();
        pool.end();
    }
})();
