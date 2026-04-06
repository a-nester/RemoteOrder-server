import pool from '../db.js';

export const runMigration = async () => {
    try {
        const queries = [
            `ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "warehouseId" uuid;`,
            `ALTER TABLE "GoodsReceipt" ADD COLUMN IF NOT EXISTS "warehouseId" uuid;`,
            `ALTER TABLE "BuyerReturn" ADD COLUMN IF NOT EXISTS "warehouseId" uuid;`,
            `ALTER TABLE "SupplierReturn" ADD COLUMN IF NOT EXISTS "warehouseId" uuid;`
        ];
        
        for (const q of queries) {
            await pool.query(q);
        }
        console.log('Migration: Added warehouseId column to document tables.');
    } catch (e) {
        console.error('Migration add_warehouse_to_documents error:', e);
    }
};
