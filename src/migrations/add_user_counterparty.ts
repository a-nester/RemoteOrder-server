import pool from '../db.js';

export const runMigration = async () => {
    try {
        console.log('Running migration: Add counterpartyId and organizationId to User table...');
        
        // 1. Add counterpartyId
        await pool.query(`
            ALTER TABLE "User"
            ADD COLUMN IF NOT EXISTS "counterpartyId" VARCHAR(255);
        `);

        // 2. Add organizationId
        await pool.query(`
            ALTER TABLE "User"
            ADD COLUMN IF NOT EXISTS "organizationId" INTEGER;
        `);

        console.log('Migration successful: counterpartyId and organizationId added to User table.');
    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    }
};
