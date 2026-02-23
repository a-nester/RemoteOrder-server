import pool from '../db.js';

export const runMigration = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if migration has already been run by inspecting a column type
        const checkRes = await client.query(`
            SELECT data_type 
            FROM information_schema.columns 
            WHERE table_name = 'OrderItem' AND column_name = 'quantity';
        `);

        if (checkRes.rows.length > 0 && checkRes.rows[0].data_type === 'numeric') {
            console.log('✅ Alter quantity decimals migration already applied.');
            await client.query('COMMIT');
            return;
        }

        console.log('🔄 Running alter quantity decimals migration...');

        // ProductBatch
        await client.query('ALTER TABLE "ProductBatch" ALTER COLUMN "quantityTotal" TYPE DECIMAL(10,3);');
        await client.query('ALTER TABLE "ProductBatch" ALTER COLUMN "quantityLeft" TYPE DECIMAL(10,3);');

        // OrderItem
        await client.query('ALTER TABLE "OrderItem" ALTER COLUMN "quantity" TYPE DECIMAL(10,3);');

        // OrderItemBatch
        await client.query('ALTER TABLE "OrderItemBatch" ALTER COLUMN "quantity" TYPE DECIMAL(10,3);');

        // RealizationItemBatch (might already be DECIMAL, but we ensure it)
        const checkRealizationRes = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'RealizationItemBatch' AND column_name = 'quantity';
        `);
        if (checkRealizationRes.rows.length > 0) {
            await client.query('ALTER TABLE "RealizationItemBatch" ALTER COLUMN "quantity" TYPE DECIMAL(10,3);');
        }

        await client.query('COMMIT');
        console.log('✅ Alter quantity decimals migration successful.');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Alter quantity decimals migration failed:', e);
    } finally {
        client.release();
    }
};
