import pool from '../db.js';

export async function runMigration() {
    try {
        console.log('Running migration: 119_add_requisites_to_organization...');
        await pool.query(`
            ALTER TABLE "Organization" 
            ADD COLUMN IF NOT EXISTS "requisites" JSONB DEFAULT '{}'::jsonb;
        `);
        console.log('Migration 119_add_requisites_to_organization completed successfully.');
    } catch (e) {
        console.error('Migration 119_add_requisites_to_organization failed:', e);
    }
}
