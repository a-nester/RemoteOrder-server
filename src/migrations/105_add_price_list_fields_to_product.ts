import { Pool } from 'pg';

export async function up(pool: Pool) {
    await pool.query(`
        ALTER TABLE "Product" 
        ADD COLUMN IF NOT EXISTS "barcode" TEXT,
        ADD COLUMN IF NOT EXISTS "packing" TEXT,
        ADD COLUMN IF NOT EXISTS "tara" TEXT;
    `);
}

export async function down(pool: Pool) {
    await pool.query(`
        ALTER TABLE "Product" 
        DROP COLUMN IF NOT EXISTS "barcode",
        DROP COLUMN IF NOT EXISTS "packing",
        DROP COLUMN IF NOT EXISTS "tara";
    `);
}
