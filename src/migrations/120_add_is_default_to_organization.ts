import pool from '../db.js';

export async function runMigration() {
    try {
        console.log('Running migration: 120_add_is_default_to_organization...');
        await pool.query(`
            ALTER TABLE "Organization" 
            ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN DEFAULT FALSE;
        `);

        // Ensure at least one organization is marked as default if none exist
        const check = await pool.query('SELECT id FROM "Organization" WHERE "isDefault" = TRUE LIMIT 1');
        if (check.rows.length === 0) {
            await pool.query(`
                UPDATE "Organization"
                SET "isDefault" = TRUE
                WHERE id = (SELECT id FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1);
            `);
        }

        console.log('Migration 120_add_is_default_to_organization completed successfully.');
    } catch (e) {
        console.error('Migration 120_add_is_default_to_organization failed:', e);
    }
}
