import pool from '../db.js';

export async function runMigration() {
    try {
        console.log('Running migration: 128_fix_inventory_count_batch_fk...');
        await pool.query(`
            ALTER TABLE "ProductBatch" 
            DROP CONSTRAINT IF EXISTS "ProductBatch_inventoryCountId_fkey",
            ADD CONSTRAINT "ProductBatch_inventoryCountId_fkey" 
            FOREIGN KEY ("inventoryCountId") REFERENCES "InventoryCount"("id") ON DELETE SET NULL;
        `);
        console.log('Migration 128_fix_inventory_count_batch_fk completed successfully.');
    } catch (e) {
        console.error('Migration 128_fix_inventory_count_batch_fk failed:', e);
    }
}
