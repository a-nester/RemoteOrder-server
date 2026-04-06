import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool();

async function run() {
  const users = await pool.query('SELECT id, role, "warehouseId" FROM "User"');
  console.log("Users:", users.rows);
  const wh = await pool.query('SELECT id, name FROM "Warehouse"');
  console.log("Warehouses:", wh.rows);
  pool.end();
}
run();
