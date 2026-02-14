import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Render
  },
});

const run = async () => {
    try {
        await pool.query(`
            ALTER TABLE "PriceDocument" 
            ADD COLUMN "roundingMethod" VARCHAR(20) DEFAULT 'NONE';
        `);
        console.log('Successfully added roundingMethod column');
    } catch (e) {
        console.error('Error adding column (might already exist):', e);
    } finally {
        await pool.end();
    }
};

run();
