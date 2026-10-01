import pool from '../db.js';

export async function runMigration() {
    try {
        console.log('Running migration: 127_add_inventory_count_to_product_batch...');
        await pool.query(`
            ALTER TABLE "ProductBatch" 
            ADD COLUMN IF NOT EXISTS "inventoryCountId" UUID REFERENCES "InventoryCount"("id") ON DELETE CASCADE;

            CREATE INDEX IF NOT EXISTS "idx_product_batch_inv_count" ON "ProductBatch"("inventoryCountId");
        `);
        console.log('Migration 127_add_inventory_count_to_product_batch completed successfully.');
    } catch (e) {
        console.error('Migration 127_add_inventory_count_to_product_batch failed:', e);
    }
}
