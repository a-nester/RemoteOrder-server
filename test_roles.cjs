require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({});
async function run() {
  const res = await pool.query('SELECT id, email, role FROM "User"');
  console.log(res.rows);
  pool.end();
}
run();
