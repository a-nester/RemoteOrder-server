import pool from '../db.js';

export const runMigration = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('Hammer Running migration: Add permissions to User table...');

        // Create the JSONB column with default structure
        const query = `
            ALTER TABLE "User" 
            ADD COLUMN IF NOT EXISTS "permissions" JSONB 
            DEFAULT '{"priceEditor": {}, "reports": {}, "finance": {}, "documents": {"orders": true, "realizations": true}}'::jsonb;
        `;
        
        await client.query(query);

        // For existing users, update their permissions if they are currently null or empty
        await client.query(`
            UPDATE "User"
            SET "permissions" = '{"priceEditor": {}, "reports": {}, "finance": {}, "documents": {"orders": true, "realizations": true}}'::jsonb
            WHERE "permissions" IS NULL OR "permissions"::text = '{}';
        `);

        await client.query('COMMIT');
        console.log('Migration successful: Permissions column added to User table');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
};
