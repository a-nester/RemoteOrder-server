import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  const res = await pool.query('SELECT id, email, role, "warehouseId" FROM "User"');
  console.log(JSON.stringify(res.rows, null, 2));
  process.exit(0);
}
run();
