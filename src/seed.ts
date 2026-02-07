import pool from './db.js';
import { products } from './data/products.js';

const seed = async () => {
  const client = await pool.connect();
  try {
    console.log('🌱 Starting seed process...');

    await client.query('BEGIN');

    // 1. Drop Table to ensure schema update
    console.log('🗑️ Dropping existing Product table...');
    await client.query('DROP TABLE IF EXISTS "Product" CASCADE');

    // 2. Create Table
    console.log('🔨 Creating Product table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS "Product" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" TEXT NOT NULL,
        "prices" JSONB DEFAULT '{}',
        "unit" TEXT NOT NULL,
        "category" TEXT,
        "photos" TEXT[] DEFAULT '{}',
        "deleted" BOOLEAN DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Create index on name for faster lookups/uniqueness if desired
    await client.query(`CREATE INDEX IF NOT EXISTS "Product_name_idx" ON "Product"("name");`);

    // 3. Insert new data
    console.log(`📦 Inserting ${products.length} products...`);
    for (const product of products) {
      // Default price structure since source data has no prices
      const prices = product.prices || { standard: 0 };

      await client.query(`
        INSERT INTO "Product" ("name", "prices", "unit", "category", "photos", "deleted", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, false, NOW())
      `, [product.name, JSON.stringify(prices), product.unit, product.category, []]);
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
