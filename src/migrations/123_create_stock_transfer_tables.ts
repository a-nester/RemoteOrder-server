import pool from '../db.js';

export async function runMigration() {
    try {
        console.log('Running migration: 123_create_stock_transfer_tables...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS "StockTransfer" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "number" VARCHAR(50) NOT NULL UNIQUE,
                "date" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "fromWarehouseId" UUID NOT NULL REFERENCES "Warehouse"("id"),
                "toWarehouseId" UUID NOT NULL REFERENCES "Warehouse"("id"),
                "status" VARCHAR(20) DEFAULT 'DRAFT',
                "comment" TEXT,
                "totalAmount" DECIMAL(12, 2) DEFAULT 0,
                "createdBy" INT REFERENCES "User"("id"),
                "postedBy" INT REFERENCES "User"("id"),
                "postedAt" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                CONSTRAINT "chk_diff_warehouses" CHECK ("fromWarehouseId" <> "toWarehouseId")
            );

            CREATE TABLE IF NOT EXISTS "StockTransferItem" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "stockTransferId" UUID NOT NULL REFERENCES "StockTransfer"("id") ON DELETE CASCADE,
                "productId" UUID NOT NULL REFERENCES "Product"("id"),
                "quantity" DECIMAL(12, 3) NOT NULL DEFAULT 0,
                "price" DECIMAL(12, 2) NOT NULL DEFAULT 0,
                "total" DECIMAL(12, 2) DEFAULT 0,
                "sortOrder" INT DEFAULT 0
            );

            ALTER TABLE "ProductBatch" 
            ADD COLUMN IF NOT EXISTS "stockTransferId" UUID REFERENCES "StockTransfer"("id");

            CREATE INDEX IF NOT EXISTS "idx_stock_tr_from_wh" ON "StockTransfer"("fromWarehouseId");
            CREATE INDEX IF NOT EXISTS "idx_stock_tr_to_wh" ON "StockTransfer"("toWarehouseId");
            CREATE INDEX IF NOT EXISTS "idx_stock_tr_status" ON "StockTransfer"("status");
            CREATE INDEX IF NOT EXISTS "idx_stock_tr_item_doc" ON "StockTransferItem"("stockTransferId");
            CREATE INDEX IF NOT EXISTS "idx_product_batch_transfer" ON "ProductBatch"("stockTransferId");
        `);

        console.log('Migration 123_create_stock_transfer_tables completed successfully.');
    } catch (e) {
        console.error('Migration 123_create_stock_transfer_tables failed:', e);
    }
}
