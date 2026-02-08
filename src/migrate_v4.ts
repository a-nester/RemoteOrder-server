import pool from './db.js';

async function migrateV4() {
    console.log('🔄 Запуск міграції V4 (Price Journal)...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Create PriceJournal table
        console.log('Hammer Creating PriceJournal table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS "PriceJournal" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "productId" UUID NOT NULL, -- References Product(id) - loose coupling optional or explicit FK
                "priceTypeId" UUID, -- Optional linkage to a PriceType table if it exists
                "oldPrice" DECIMAL(10, 2),
                "newPrice" DECIMAL(10, 2) NOT NULL,
                "effectiveDate" TIMESTAMP NOT NULL DEFAULT NOW(),
                "createdBy" UUID, -- ID of the user/admin
                "reason" TEXT,
                "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `);

        // 2. Indexes
        console.log('🔍 Creating indexes...');
        await client.query(`CREATE INDEX IF NOT EXISTS "PriceJournal_productId_idx" ON "PriceJournal"("productId");`);
        await client.query(`CREATE INDEX IF NOT EXISTS "PriceJournal_effectiveDate_idx" ON "PriceJournal"("effectiveDate");`);

        await client.query('COMMIT');
        console.log('🎉 Міграція V4 завершена успішно!');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Помилка міграції:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

migrateV4();
