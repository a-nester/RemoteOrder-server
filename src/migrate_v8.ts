import pool from './db.js';

async function migrateV8() {
    console.log('🔄 Запуск міграції V8 (Goods Receipt)...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Create GoodsReceipt table
        console.log('Hammer Creating GoodsReceipt table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS "GoodsReceipt" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "number" VARCHAR(50) NOT NULL,
                "date" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                "warehouseId" UUID REFERENCES "Warehouse"("id"),
                "providerId" UUID REFERENCES "Counterparty"("id"),
                "status" VARCHAR(50) NOT NULL DEFAULT 'SAVED', -- 'SAVED', 'POSTED'
                "comment" TEXT,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "isDeleted" BOOLEAN DEFAULT FALSE,
                "createdBy" TEXT -- User ID
            );
        `);

        // 2. Create GoodsReceiptItem table
        console.log('Hammer Creating GoodsReceiptItem table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS "GoodsReceiptItem" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "goodsReceiptId" UUID NOT NULL REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE,
                "productId" TEXT NOT NULL, -- References Product (TEXT id)
                "quantity" DECIMAL(10, 3) NOT NULL,
                "price" DECIMAL(10, 2) NOT NULL,
                "total" DECIMAL(10, 2) NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // 3. Update ProductBatch table to link to GoodsReceipt
        console.log('Hammer Updating ProductBatch table...');
        await client.query(`
            ALTER TABLE "ProductBatch" 
            ADD COLUMN IF NOT EXISTS "goodsReceiptId" UUID REFERENCES "GoodsReceipt"("id") ON DELETE SET NULL;
        `);

        // 4. Indexes
        console.log('🔍 Creating indexes...');
        await client.query(`CREATE INDEX IF NOT EXISTS "GoodsReceipt_warehouseId_idx" ON "GoodsReceipt"("warehouseId");`);
        await client.query(`CREATE INDEX IF NOT EXISTS "GoodsReceipt_providerId_idx" ON "GoodsReceipt"("providerId");`);
        await client.query(`CREATE INDEX IF NOT EXISTS "GoodsReceipt_date_idx" ON "GoodsReceipt"("date");`);
        await client.query(`CREATE INDEX IF NOT EXISTS "GoodsReceiptItem_goodsReceiptId_idx" ON "GoodsReceiptItem"("goodsReceiptId");`);
        await client.query(`CREATE INDEX IF NOT EXISTS "ProductBatch_goodsReceiptId_idx" ON "ProductBatch"("goodsReceiptId");`);

        await client.query('COMMIT');
        console.log('🎉 Міграція V8 завершена успішно!');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Помилка міграції:', error);
        throw error;
    } finally {
        client.release();
        process.exit(0);
    }
}

migrateV8();
