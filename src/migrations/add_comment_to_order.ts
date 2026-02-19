
import pool from '../db.js';

export const runMigration = async () => {
    const client = await pool.connect();
    try {
        console.log('Running migration: Add comment column to Order table');
        await client.query(`
            ALTER TABLE "Order" 
            ADD COLUMN IF NOT EXISTS "comment" TEXT;
        `);
        console.log('Migration successful');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        client.release();
    }
};
