import pool from '../db.js';

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('Adding salesTypes column to Organization...');
        await client.query(`
            ALTER TABLE "Organization" 
            ADD COLUMN IF NOT EXISTS "salesTypes" JSONB DEFAULT '["Готівковий", "р/р ФОП", "з ПДВ"]'
        `);

        console.log('Adding defaultSalesType column to Counterparty...');
        await client.query(`
            ALTER TABLE "Counterparty" 
            ADD COLUMN IF NOT EXISTS "defaultSalesType" VARCHAR(255) DEFAULT 'Готівковий'
        `);

        console.log('Adding salesType column to Realization...');
        await client.query(`
            ALTER TABLE "Realization" 
            ADD COLUMN IF NOT EXISTS "salesType" VARCHAR(255) DEFAULT 'Готівковий'
        `);

        // Update existing records
        console.log('Updating existing Counterparty records...');
        await client.query(`
            UPDATE "Counterparty" 
            SET "defaultSalesType" = 'Готівковий' 
            WHERE "defaultSalesType" IS NULL
        `);

        console.log('Updating existing Realization records...');
        await client.query(`
            UPDATE "Realization" 
            SET "salesType" = 'Готівковий' 
            WHERE "salesType" IS NULL
        `);

        await client.query('COMMIT');
        console.log('Migration completed successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
        throw error;
    } finally {
        client.release();
        process.exit(0);
    }
}

migrate();
