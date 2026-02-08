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

    // 2. Create Tables
    console.log('🔨 Creating tables...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "PriceType" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" TEXT NOT NULL,
        "slug" TEXT UNIQUE NOT NULL,
        "currency" TEXT DEFAULT 'UAH',
        "deleted" BOOLEAN DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "User" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "phone" TEXT UNIQUE NOT NULL,
        "password" TEXT NOT NULL,
        "name" TEXT,
        "priceType" TEXT DEFAULT 'standard',
        "deleted" BOOLEAN DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

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

    await client.query(`
      CREATE TABLE IF NOT EXISTS "ProductBatch" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "productId" UUID NOT NULL,
        "quantityTotal" INT NOT NULL,
        "quantityLeft" INT NOT NULL,
        "enterPrice" DECIMAL(10, 2) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Normalized Order Structure
    await client.query(`
      CREATE TABLE IF NOT EXISTS "OrderItem" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "orderId" UUID NOT NULL, -- Link to Order table (which we need to ensure exists or is created/updated later)
        "productId" UUID NOT NULL,
        "quantity" INT NOT NULL,
        "sellPrice" DECIMAL(10, 2) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "OrderItemBatch" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "orderItemId" UUID NOT NULL,
        "productBatchId" UUID NOT NULL,
        "quantity" INT NOT NULL,
        "enterPrice" DECIMAL(10, 2) NOT NULL,
         "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
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
