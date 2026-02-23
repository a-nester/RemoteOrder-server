import pool from '../db.js';

export const runMigration = async () => {
    const client = await pool.connect();
    try {
        console.log('Running migration: Add parentId to CounterpartyGroup table');
        await client.query(`
            ALTER TABLE "CounterpartyGroup" 
            ADD COLUMN IF NOT EXISTS "parentId" UUID REFERENCES "CounterpartyGroup"("id") ON DELETE CASCADE;
        `);
        console.log('Migration successful');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        client.release();
    }
};
