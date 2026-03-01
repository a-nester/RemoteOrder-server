import pool from './dist/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = await pool.connect();
  try {
    const whRes = await client.query('SELECT id FROM "Warehouse" LIMIT 1');
    const defaultWh = whRes.rows[0].id;
    const updateRes = await client.query(`UPDATE "Realization" SET "warehouseId" = $1 WHERE "warehouseId" IS NULL`, [defaultWh]);
    console.log(`Updated ${updateRes.rowCount} realizations to default warehouse ${defaultWh}`);
  } catch(e) { console.error(e); }
  finally { client.release(); pool.end(); }
}
run();
