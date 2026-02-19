
import pool from '../db.js';

export const runMigration = async () => {
    const client = await pool.connect();
    try {
        console.log('Running migration: Add docNumber column to Order, Realization, GoodsReceipt');

        // Order
        await client.query(`ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "docNumber" TEXT;`);

        // Realization (if exists)
        try {
            await client.query(`ALTER TABLE "Realization" ADD COLUMN IF NOT EXISTS "docNumber" TEXT;`);
        } catch (e) { /* ignore if table doesn't exist */ }

        // GoodsReceipt (if exists)
        try {
            await client.query(`ALTER TABLE "GoodsReceipt" ADD COLUMN IF NOT EXISTS "docNumber" TEXT;`);
        } catch (e) { /* ignore if table doesn't exist */ }

        console.log('Migration successful: docNumber columns added');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        client.release();
    }
};
