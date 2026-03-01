import pool from './dist/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = await pool.connect();
  try {
    const res = await client.query(`SELECT id, "warehouseId", "orderId", "createdAt" FROM "Realization" WHERE id = '8337a37d-d461-4769-b9f3-7566e4329185'`);
    console.log(res.rows[0]);
  } catch(e) { console.error(e); }
  finally { client.release(); pool.end(); }
}
run();
