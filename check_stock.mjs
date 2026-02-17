import fs from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  const client = await pool.connect();
  try {
    const productId = 'cce7e1f3-3dd5-4488-9ca8-60a4c94b5b3c';
    
    // Get Name
    const resProd = await client.query('SELECT name FROM "Product" WHERE id = $1', [productId]);
    const productName = resProd.rows[0]?.name || 'Unknown';
    console.log(`Product: ${productName} (${productId})`);

    // Get Batches
    const resBatches = await client.query('SELECT * FROM "ProductBatch" WHERE "productId" = $1', [productId]);
    console.log('Batches:', resBatches.rows);

    // Calculate total
    const total = resBatches.rows.reduce((sum, b) => sum + b.quantityLeft, 0);
    console.log(`Total Stock Available: ${total}`);

  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    pool.end();
  }
}

check();
