import { Pool } from 'pg';

export async function up(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "BuyerReturn" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "number" VARCHAR(255) NOT NULL,
      "date" TIMESTAMP NOT NULL,
      "counterpartyId" UUID NOT NULL REFERENCES "Counterparty"("id"),
      "warehouseId" UUID NOT NULL REFERENCES "Warehouse"("id"),
      "comment" TEXT,
      "status" VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
      "totalAmount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
      "profit" DECIMAL(10, 2) NOT NULL DEFAULT 0,
      "createdBy" UUID,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "BuyerReturnItem" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "buyerReturnId" UUID NOT NULL REFERENCES "BuyerReturn"("id") ON DELETE CASCADE,
      "productId" UUID NOT NULL REFERENCES "Product"("id"),
      "quantity" DECIMAL(10, 3) NOT NULL,
      "price" DECIMAL(10, 2) NOT NULL,
      "total" DECIMAL(10, 2) NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "BuyerReturnItemBatch" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "buyerReturnItemId" UUID NOT NULL REFERENCES "BuyerReturnItem"("id") ON DELETE CASCADE,
      "productBatchId" UUID NOT NULL REFERENCES "ProductBatch"("id") ON DELETE CASCADE,
      "quantity" DECIMAL(10, 3) NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

export async function down(pool: Pool) {
  await pool.query(`DROP TABLE IF EXISTS "BuyerReturnItemBatch";`);
  await pool.query(`DROP TABLE IF EXISTS "BuyerReturnItem";`);
  await pool.query(`DROP TABLE IF EXISTS "BuyerReturn";`);
}
