import { config } from 'dotenv';
config();
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
    const client = await pool.connect();
    try {
        const p = await client.query(`SELECT id, name FROM "Product" WHERE name LIKE '%Сир твердий «Традиційний» МілКрай брус%'`);
        if (p.rows.length === 0) return;
        const pId = p.rows[0].id;

        // Check mismatched Realization Items
        // `Realization` table holds orders. Inside it we have `RealizationItem`.
        const res = await client.query(`
            SELECT ri.id, r.number, r.date, ri.quantity as "needed", 
            COALESCE(SUM(oib."quantity"), 0) as "sumBatches"
            FROM "RealizationItem" ri
            JOIN "Realization" r ON ri."realizationId" = r.id
            LEFT JOIN "OrderItemBatch" oib ON oib."orderItemId" = ri.id
            WHERE ri."productId" = $1 AND r.status = 'POSTED'
            GROUP BY ri.id, r.number, r.date, ri.quantity
            HAVING ri.quantity != COALESCE(SUM(oib."quantity"), 0)
        `, [pId]);
        
        console.log("Mismatched Realization Items:");
        console.dir(res.rows, { depth: null });

    } catch (e) {
      console.error(e);
    } finally {
        client.release();
        await pool.end();
    }
}
check();
