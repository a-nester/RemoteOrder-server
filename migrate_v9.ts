import pool from './src/db.js';

async function migrateV9() {
    console.log('🔄 Запуск міграції V9 (GoodsReceiptItem sortOrder)...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        await client.query(`
            ALTER TABLE "GoodsReceiptItem" 
            ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER DEFAULT 0;
        `);

        // Update existing sortOrder sequentially based on creation time
        await client.query(`
            WITH NumberedItems AS (
                SELECT id, row_number() over (PARTITION BY "goodsReceiptId" ORDER BY "createdAt" ASC) - 1 as new_sort
                FROM "GoodsReceiptItem"
            )
            UPDATE "GoodsReceiptItem"
            SET "sortOrder" = NumberedItems.new_sort
            FROM NumberedItems
            WHERE "GoodsReceiptItem".id = NumberedItems.id;
        `);

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
