import pool from './dist/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = await pool.connect();
  try {
    const res = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'Order'`);
    console.log("Order columns:", res.rows.map(r => r.column_name));
    
    const rRes = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'Realization'`);
    console.log("Realization columns:", rRes.rows.map(r => r.column_name));
  } catch(e) { console.error(e); }
  finally { client.release(); pool.end(); }
}
run();
