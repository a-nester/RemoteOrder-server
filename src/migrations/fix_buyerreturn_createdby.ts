import pool from '../db.js';

export const runMigration = async () => {
    const client = await pool.connect();
    try {
        console.log('Running migration: Fix BuyerReturn createdBy column');
        await client.query(`
            ALTER TABLE "BuyerReturn" 
            ALTER COLUMN "createdBy" TYPE VARCHAR(255)
            USING "createdBy"::VARCHAR;
        `);
        console.log('Migration successful: BuyerReturn createdBy altered');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        client.release();
    }
};
