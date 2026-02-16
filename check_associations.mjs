import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: "postgresql://remoteorder_user:wDJme334tcPVfpgd0ozQduahRKHgHsBS@dpg-d63kbnq4d50c73dpj6i0-a.oregon-postgres.render.com/remoteorder",
  ssl: { rejectUnauthorized: false }
});

(async () => {
    const client = await pool.connect();
    try {
        // 1. Get the synced order
        console.log("Fetching order...");
        const orderRes = await client.query(`SELECT id, "createdAt", "counterpartyId", total FROM "Order" WHERE total > 5000 ORDER BY "createdAt" DESC LIMIT 1`);
        
        if (orderRes.rows.length === 0) {
            console.log("No orders found > 5000");
             const allOrders = await client.query(`SELECT id, total FROM "Order" LIMIT 5`);
             console.log("Some orders:", allOrders.rows);
             return;
        }

        const order = orderRes.rows[0];
        console.log("Order Found:", order);

        if (order) {
            // 2. Check if counterparty exists
            if (order.counterpartyId) {
                console.log(`Checking Counterparty ID: ${order.counterpartyId}`);
                const cpRes = await client.query(`SELECT id, name FROM "Counterparty" WHERE id = $1`, [order.counterpartyId]);
                if (cpRes.rows.length > 0) {
                    console.log("✅ Counterparty Found:", cpRes.rows[0]);
                } else {
                    console.log("❌ Counterparty NOT Found for ID:", order.counterpartyId);
                    
                    // List available
                    const allCps = await client.query(`SELECT id, name FROM "Counterparty" LIMIT 5`);
                    console.log("Available Counterparties (first 5):", allCps.rows);
                }

            } else {
                console.log("⚠️ Order has NO counterpartyId");
            }
        }
    } catch (e) {
        console.error("Error:", e);
    } finally {
        client.release();
        pool.end();
    }
})();
