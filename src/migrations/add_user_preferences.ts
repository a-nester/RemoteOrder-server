import pool from '../db.js';

export const runMigration = async () => {
    try {
        console.log('Running migration: Add preferences to User table...');
        
        await pool.query(`
            ALTER TABLE "User"
            ADD COLUMN IF NOT EXISTS "preferences" JSONB DEFAULT '{}';
        `);

        console.log('Migration successful: preferences added to User table.');
    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    }
};

runMigration().then(() => process.exit(0)).catch(() => process.exit(1));
