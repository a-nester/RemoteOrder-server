import pool from '../db.js';

export async function runMigration() {
    try {
        console.log('Running migration: 117_add_database_backup_table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS "DatabaseBackup" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "filename" VARCHAR(255) UNIQUE NOT NULL,
                "size" BIGINT NOT NULL,
                "fileData" BYTEA NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        console.log('Migration 117_add_database_backup_table completed successfully.');
    } catch (e) {
        console.error('Migration 117_add_database_backup_table failed:', e);
    }
}
