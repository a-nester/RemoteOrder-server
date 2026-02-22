import pool from '../db.js';

async function migrateV10() {
    console.log('🔄 Запуск міграції V10 (Realization FIFO Batches)...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Add profit to Realization
        console.log('Hammer Adding profit column to Realization table...');
        await client.query(`
            ALTER TABLE "Realization" 
            ADD COLUMN IF NOT EXISTS "profit" DECIMAL(10, 2) NOT NULL DEFAULT 0;
        `);

        // 2. Create RealizationItemBatch table
        console.log('Hammer Creating RealizationItemBatch table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS "RealizationItemBatch" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "realizationItemId" UUID NOT NULL REFERENCES "RealizationItem"("id") ON DELETE CASCADE,
                "productBatchId" UUID NOT NULL REFERENCES "ProductBatch"("id") ON DELETE CASCADE,
                "quantity" DECIMAL(10, 3) NOT NULL,
                "enterPrice" DECIMAL(10, 2) NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // 3. Indexes
        console.log('🔍 Creating indexes...');
        await client.query(`CREATE INDEX IF NOT EXISTS "RealizationItemBatch_realizationItemId_idx" ON "RealizationItemBatch"("realizationItemId");`);
        await client.query(`CREATE INDEX IF NOT EXISTS "RealizationItemBatch_productBatchId_idx" ON "RealizationItemBatch"("productBatchId");`);

        await client.query('COMMIT');
        console.log('🎉 Міграція V10 завершена успішно!');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Помилка міграції:', error);
        throw error;
    } finally {
        client.release();
        process.exit(0);
    }
}

migrateV10();
