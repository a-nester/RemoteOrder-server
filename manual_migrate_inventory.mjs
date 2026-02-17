import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function manualMigrateInventory() {
    console.log('🔄 Запуск ручної міграції (Inventory Tables)...');
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            console.log('Hammer Checking/Creating ProductBatch table...');
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

            console.log('Hammer Checking/Creating OrderItem table...');
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

            console.log('Hammer Checking/Creating OrderItemBatch table...');
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

            console.log('🔍 Creating indexes...');
            await client.query(`CREATE INDEX IF NOT EXISTS "ProductBatch_productId_idx" ON "ProductBatch"("productId");`);
            await client.query(`CREATE INDEX IF NOT EXISTS "ProductBatch_createdAt_idx" ON "ProductBatch"("createdAt");`);
            await client.query(`CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");`);

            // Also check for PriceJournal (V4) just in case
            console.log('Hammer Checking/Creating PriceJournal table...');
            await client.query(`
                CREATE TABLE IF NOT EXISTS "PriceJournal" (
                    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    "productId" UUID NOT NULL, 
                    "priceTypeId" UUID, 
                    "oldPrice" DECIMAL(10, 2),
                    "newPrice" DECIMAL(10, 2) NOT NULL,
                    "effectiveDate" TIMESTAMP NOT NULL DEFAULT NOW(),
                    "createdBy" UUID, 
                    "reason" TEXT,
                    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
                );
            `);
             await client.query(`CREATE INDEX IF NOT EXISTS "PriceJournal_productId_idx" ON "PriceJournal"("productId");`);
             await client.query(`CREATE INDEX IF NOT EXISTS "PriceJournal_effectiveDate_idx" ON "PriceJournal"("effectiveDate");`);


            // And V5 (Price Documents)
             console.log('Hammer Checking/Creating PriceDocument tables...');
            await client.query(`
                CREATE TABLE IF NOT EXISTS "PriceDocument" (
                    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    "date" TIMESTAMP NOT NULL DEFAULT NOW(),
                    "status" TEXT NOT NULL DEFAULT 'DRAFT',
                    "targetPriceTypeId" UUID,
                    "inputMethod" TEXT NOT NULL DEFAULT 'MANUAL',
                    "sourcePriceTypeId" UUID,
                    "markupPercentage" DECIMAL(10, 2),
                    "comment" TEXT,
                    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
                    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
                );
            `);
            await client.query(`
                CREATE TABLE IF NOT EXISTS "PriceDocumentItem" (
                    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    "documentId" UUID NOT NULL,
                    "productId" UUID NOT NULL,
                    "price" DECIMAL(10, 2) NOT NULL,
                    "oldPrice" DECIMAL(10, 2),
                    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
                );
            `);
            await client.query(`CREATE INDEX IF NOT EXISTS "PriceDocument_date_idx" ON "PriceDocument"("date");`);
            await client.query(`CREATE INDEX IF NOT EXISTS "PriceDocumentItem_documentId_idx" ON "PriceDocumentItem"("documentId");`);


            await client.query('COMMIT');
            console.log('🎉 Ручна міграція завершена успішно!');
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

manualMigrateInventory();
