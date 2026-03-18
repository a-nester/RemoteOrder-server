import pool from '../db.js';

export async function runMigration() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Create SupplierReturn Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS "SupplierReturn" (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "number" VARCHAR(50) UNIQUE NOT NULL,
                "date" TIMESTAMP NOT NULL DEFAULT NOW(),
                "supplierId" UUID REFERENCES "Counterparty"(id) ON DELETE RESTRICT,
                "warehouseId" UUID REFERENCES "Warehouse"(id) ON DELETE RESTRICT,
                "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
                "totalAmount" NUMERIC(10,2) DEFAULT 0,
                "comment" TEXT,
                "createdBy" TEXT,
                "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `);

        // Create SupplierReturnItem Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS "SupplierReturnItem" (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "supplierReturnId" UUID NOT NULL REFERENCES "SupplierReturn"(id) ON DELETE CASCADE,
                "productId" UUID NOT NULL REFERENCES "Product"(id) ON DELETE RESTRICT,
                "quantity" NUMERIC(10,3) NOT NULL,
                "price" NUMERIC(10,2) NOT NULL,
                "total" NUMERIC(10,2) NOT NULL,
                "sortOrder" INTEGER DEFAULT 0,
                "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `);

        // Create SupplierReturnItemBatch Table (FIFO mapping for unposting)
        await client.query(`
            CREATE TABLE IF NOT EXISTS "SupplierReturnItemBatch" (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "supplierReturnItemId" UUID NOT NULL REFERENCES "SupplierReturnItem"(id) ON DELETE CASCADE,
                "productBatchId" UUID NOT NULL REFERENCES "ProductBatch"(id) ON DELETE CASCADE,
                "quantity" NUMERIC(10,3) NOT NULL,
                "enterPrice" NUMERIC(10,2) NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `);

        await client.query('COMMIT');
        console.log('Migration successful: Supplier Returns tables created');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed: Create Supplier Returns tables', error);
        throw error;
    } finally {
        client.release();
    }
}
