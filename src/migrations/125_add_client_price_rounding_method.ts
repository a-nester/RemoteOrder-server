import pool from '../db.js';

export async function runMigration() {
    try {
        console.log('Running migration: 125_add_client_price_rounding_method...');
        await pool.query(`
            ALTER TABLE "ClientPriceDocument" 
            ADD COLUMN IF NOT EXISTS "roundingMethod" VARCHAR(20) DEFAULT 'UP';
        `);
        console.log('Migration 125_add_client_price_rounding_method completed successfully.');
    } catch (e) {
        console.error('Migration 125_add_client_price_rounding_method failed:', e);
    }
}
