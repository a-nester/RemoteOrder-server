import pool from '../db.js';

export async function up() {
    await pool.query(`
        ALTER TABLE "ClientPriceDocument" 
        ADD COLUMN IF NOT EXISTS "roundingValue" NUMERIC(10, 2) DEFAULT NULL;
    `);
}
