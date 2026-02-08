import pool from './db.js';

async function migrateV3() {
    console.log('🔄 Запуск міграції V3 (FIFO Inventory)...');
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Create ProductBatch
            console.log('Hammer Creating ProductBatch table...');
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

            // 2. Create OrderItem (Normalized)
            console.log('Hammer Creating OrderItem table...');
            await client.query(`
                CREATE TABLE IF NOT EXISTS "OrderItem" (
                    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    "orderId" UUID NOT NULL,
                    "productId" UUID NOT NULL,
                    "quantity" INT NOT NULL,
                    "sellPrice" DECIMAL(10, 2) NOT NULL,
                    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
                );
            `);

            // 3. Create OrderItemBatch
            console.log('Hammer Creating OrderItemBatch table...');
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

            // 4. Create Indexes
            console.log('🔍 Creating indexes...');
            await client.query(`CREATE INDEX IF NOT EXISTS "ProductBatch_productId_idx" ON "ProductBatch"("productId");`);
            await client.query(`CREATE INDEX IF NOT EXISTS "ProductBatch_createdAt_idx" ON "ProductBatch"("createdAt");`);
            await client.query(`CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");`);

            await client.query('COMMIT');
            console.log('🎉 Міграція V3 завершена успішно!');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('❌ Помилка міграції:', error);
    } finally {
        await pool.end();
    }
}

migrateV3();
