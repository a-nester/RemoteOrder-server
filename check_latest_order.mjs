import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkLatestOrder() {
  try {
    const client = await pool.connect();
    
    const res = await client.query(`
      SELECT o.id, o."createdAt", o.total, o.status, o."counterpartyId", c.name as "counterpartyName", o.items
      FROM "Order" o
      LEFT JOIN "Counterparty" c ON c.id = o."counterpartyId"
      ORDER BY o."createdAt" DESC
      LIMIT 1
    `);

    if (res.rows.length === 0) {
      console.log("No orders found.");
    } else {
      const order = res.rows[0];
      console.log("Latest Order:");
      console.log(JSON.stringify(order, null, 2));
      
      if (order.counterpartyId && !order.counterpartyName) {
          console.error("WARNING: Order has counterpartyId but no matching Counterparty found!");
      } else if (!order.counterpartyId) {
          console.error("WARNING: Order is missing counterpartyId!");
      } else {
          console.log("SUCCESS: Order has valid Counterparty association.");
      }
    }

    client.release();
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkLatestOrder();
