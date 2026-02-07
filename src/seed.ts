import pool from './db.js';
import { products } from './data/products.js';

const seed = async () => {
  const client = await pool.connect();
  try {
    console.log('🌱 Starting seed process...');

    await client.query('BEGIN');

    // 1. Create Table if not exists
    console.log('🔨 Ensuring Product table exists...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Product" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" TEXT NOT NULL,
        "price" DECIMAL(10, 2) NOT NULL,
        "unit" TEXT NOT NULL,
        "category" TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Create index on name for faster lookups/uniqueness if desired
    await client.query(`CREATE INDEX IF NOT EXISTS "Product_name_idx" ON "Product"("name");`);

    // 2. Clear existing data (Optional: remove if you want append behavior)
    console.log('🧹 Clearing existing products...');
    await client.query('TRUNCATE TABLE "Product" RESTART IDENTITY');

    // 3. Insert new data
    console.log(`📦 Inserting ${products.length} products...`);
    for (const product of products) {
      await client.query(`
        INSERT INTO "Product" ("name", "price", "unit", "category")
        VALUES ($1, 0, $2, $3)
      `, [product.name, product.unit, product.category]);
    }

    await client.query('COMMIT');
    console.log('✅ Seed completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

seed();
