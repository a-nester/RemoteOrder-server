import pool from '../db.js';

export async function runMigration() {
    try {
        console.log('Running migration: 122_create_inventory_count_tables...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS "InventoryCount" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "number" VARCHAR(50) NOT NULL UNIQUE,
                "date" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "warehouseId" UUID NOT NULL REFERENCES "Warehouse"("id"),
                "status" VARCHAR(20) DEFAULT 'DRAFT',
                "comment" TEXT,
                "totalAccountingAmount" DECIMAL(12, 2) DEFAULT 0,
                "totalActualAmount" DECIMAL(12, 2) DEFAULT 0,
                "totalSurplusAmount" DECIMAL(12, 2) DEFAULT 0,
                "totalShortageAmount" DECIMAL(12, 2) DEFAULT 0,
                "createdBy" UUID REFERENCES "User"("id"),
                "postedBy" UUID REFERENCES "User"("id"),
                "postedAt" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS "InventoryCountItem" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "inventoryCountId" UUID NOT NULL REFERENCES "InventoryCount"("id") ON DELETE CASCADE,
                "productId" UUID NOT NULL REFERENCES "Product"("id"),
                "accountingQty" DECIMAL(12, 3) NOT NULL DEFAULT 0,
                "actualQty" DECIMAL(12, 3) NOT NULL DEFAULT 0,
                "price" DECIMAL(12, 2) NOT NULL DEFAULT 0,
                "accountingTotal" DECIMAL(12, 2) DEFAULT 0,
                "actualTotal" DECIMAL(12, 2) DEFAULT 0,
                "differenceTotal" DECIMAL(12, 2) DEFAULT 0,
                "sortOrder" INT DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS "idx_inv_count_wh" ON "InventoryCount"("warehouseId");
            CREATE INDEX IF NOT EXISTS "idx_inv_count_status" ON "InventoryCount"("status");
            CREATE INDEX IF NOT EXISTS "idx_inv_count_item_doc" ON "InventoryCountItem"("inventoryCountId");
        `);

        console.log('Migration 122_create_inventory_count_tables completed successfully.');
    } catch (e) {
        console.error('Migration 122_create_inventory_count_tables failed:', e);
    }
}
