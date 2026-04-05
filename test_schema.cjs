require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({});
async function run() {
  const res = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'User';
  `);
  console.log(res.rows);
  pool.end();
}
run();
