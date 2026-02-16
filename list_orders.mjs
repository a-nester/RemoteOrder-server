import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: "postgresql://remoteorder_user:wDJme334tcPVfpgd0ozQduahRKHgHsBS@dpg-d63kbnq4d50c73dpj6i0-a.oregon-postgres.render.com/remoteorder",
  ssl: { rejectUnauthorized: false }
});

(async () => {
    const client = await pool.connect();
    try {
        const res = await client.query(`
            SELECT o.id, o."createdAt", o.total, o.status, c.name as "counterpartyName", o."counterpartyId"
            FROM "Order" o
            LEFT JOIN "Counterparty" c ON c.id = o."counterpartyId"
            ORDER BY o."createdAt" DESC
        `);
        console.log("Current Orders in DB:");
        console.table(res.rows);
    } catch (e) {
        console.error("Error fetching orders:", e);
    } finally {
        client.release();
        pool.end();
    }
})();
