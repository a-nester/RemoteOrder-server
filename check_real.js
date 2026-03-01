import pool from './dist/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = await pool.connect();
  try {
    const res = await client.query(`SELECT id, "warehouseId", date FROM "Realization" WHERE status = 'DRAFT' ORDER BY date DESC LIMIT 5`);
    console.log("Draft Realizations:", res.rows);
  } catch(e) { console.error(e); }
  finally { client.release(); pool.end(); }
}
run();
