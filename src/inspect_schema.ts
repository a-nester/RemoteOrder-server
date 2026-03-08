import { connectDB, disconnectDB } from './db.js';
import pool from './db.js';
async function run() {
  await connectDB();
  const res1 = await pool.query(\`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'RealizationItemBatch'\`);
  console.log('RealizationItemBatch columns:', res1.rows);
  const res2 = await pool.query(\`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'RealizationItem'\`);
  console.log('RealizationItem columns:', res2.rows);
  const res3 = await pool.query(\`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'Realization'\`);
  console.log('Realization columns:', res3.rows);
  await disconnectDB();
}
run();
