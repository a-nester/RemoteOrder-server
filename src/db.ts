import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Render
  },
});

export const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL Connected via pg');
    client.release();
  } catch (error) {
    if (error instanceof Error) {
      console.error(`❌ Database Error: ${error.message}`);
    } else {
      console.error('❌ An unknown error occurred');
    }
    process.exit(1);
  }
};

export const disconnectDB = async () => {
  await pool.end();
};

export default pool;
