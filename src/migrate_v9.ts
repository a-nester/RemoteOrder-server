import pool from './db.js';

async function migrateV9() {
    console.log('🔄 Запуск міграції V9 (Goods Receipt PriceType)...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Add priceTypeId column to GoodsReceipt
        console.log('Hammer Adding priceTypeId column to GoodsReceipt...');
        await client.query(`
            ALTER TABLE "GoodsReceipt" 
            ADD COLUMN IF NOT EXISTS "priceTypeId" UUID REFERENCES "PriceType"("id");
        `);

        // Index
        await client.query(`CREATE INDEX IF NOT EXISTS "GoodsReceipt_priceTypeId_idx" ON "GoodsReceipt"("priceTypeId");`);

        await client.query('COMMIT');
        console.log('🎉 Міграція V9 завершена успішно!');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Помилка міграції:', error);
        throw error;
    } finally {
        client.release();
        process.exit(0);
    }
}

migrateV9();
