import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkUsers() {
  try {
    const client = await pool.connect();
    
    // Check Users
    const res = await client.query('SELECT id, email FROM "User"');
    console.log("Users in Prod DB:", res.rows);
    
    // Check if Order has FK on userId
    const fkRes = await client.query(`
        SELECT
            tc.table_schema, 
            tc.constraint_name, 
            tc.table_name, 
            kcu.column_name, 
            ccu.table_schema AS foreign_table_schema,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name 
        FROM 
            information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='Order';
    `);
    
    console.log("Foreign Keys on Order:", fkRes.rows);

    client.release();
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkUsers();
