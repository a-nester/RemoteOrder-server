import pool from './db.js';

async function migrateV5() {
    console.log('🔄 Запуск міграції V5 (Price Documents)...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Create PriceDocument table
        console.log('Hammer Creating PriceDocument table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS "PriceDocument" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "date" TIMESTAMP NOT NULL DEFAULT NOW(),
                "status" TEXT NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'APPLIED'
                "targetPriceTypeId" UUID, -- PriceType being updated
                "inputMethod" TEXT NOT NULL DEFAULT 'MANUAL', -- 'MANUAL', 'FORMULA'
                "sourcePriceTypeId" UUID, -- For 'FORMULA' method
                "markupPercentage" DECIMAL(10, 2), -- For 'FORMULA' method
                "comment" TEXT,
                "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `);

        // 2. Create PriceDocumentItem table
        console.log('Hammer Creating PriceDocumentItem table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS "PriceDocumentItem" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "documentId" UUID NOT NULL,
                "productId" UUID NOT NULL,
                "price" DECIMAL(10, 2) NOT NULL,
                "oldPrice" DECIMAL(10, 2), -- Snapshot for history/verification
                "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `);

        // 3. Indexes
        console.log('🔍 Creating indexes...');
        await client.query(`CREATE INDEX IF NOT EXISTS "PriceDocument_date_idx" ON "PriceDocument"("date");`);
        await client.query(`CREATE INDEX IF NOT EXISTS "PriceDocumentItem_documentId_idx" ON "PriceDocumentItem"("documentId");`);

        await client.query('COMMIT');
        console.log('🎉 Міграція V5 завершена успішно!');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Помилка міграції:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

migrateV5();
