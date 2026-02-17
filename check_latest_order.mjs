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
      SELECT o.id, o."createdAt", o.total, o.status, o."counterpartyId", c.name as "counterpartyName"
      FROM "Order" o
      LEFT JOIN "Counterparty" c ON c.id = o."counterpartyId"
      ORDER BY o."createdAt" DESC
      LIMIT 5
    `);

    console.log("Last 10 Orders:");
    console.table(res.rows);

    client.release();
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkLatestOrder();
