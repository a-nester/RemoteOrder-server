const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const { rows } = await pool.query(`
      SELECT event_object_table, trigger_name, event_manipulation, action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'OrderItem' OR event_object_table = 'Order';
    `);
    console.log('Triggers:', rows);
  } catch(e) { console.error(e); }
  process.exit(0);
}
run();
