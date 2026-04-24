import pool from '../db.js';

export const runMigration = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if migration has already been run by inspecting a column exists
        const checkRes = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'OrderItem' AND column_name = 'sortOrder';
        `);

        if (checkRes.rows.length > 0) {
            console.log('✅ Add sortOrder migration already applied.');
            await client.query('COMMIT');
            return;
        }

        console.log('🔄 Running add sortOrder migration...');

        // OrderItem
        await client.query('ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "sortOrder" INT DEFAULT 0;');

        // RealizationItem
        await client.query('ALTER TABLE "RealizationItem" ADD COLUMN IF NOT EXISTS "sortOrder" INT DEFAULT 0;');

        await client.query('COMMIT');
        console.log('✅ Add sortOrder migration successful.');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Add sortOrder migration failed:', e);
    } finally {
        client.release();
    }
};
