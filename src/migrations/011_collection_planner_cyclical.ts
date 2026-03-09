import pool from '../db.js';

export const runMigration = async () => {
    try {
        console.log('Running migration: collection_schedule cyclical upgrade...');
        
        await pool.query(`
            -- Alter table (drop old date if present from old deployments)
            ALTER TABLE collection_schedule DROP COLUMN IF EXISTS date;
            ALTER TABLE collection_schedule ADD COLUMN IF NOT EXISTS day_of_week SMALLINT CHECK (day_of_week BETWEEN 1 AND 7);

            -- Add new indices
            CREATE INDEX IF NOT EXISTS idx_collection_schedule_day ON collection_schedule(day_of_week);
            CREATE INDEX IF NOT EXISTS idx_collection_schedule_client_day ON collection_schedule(client_id, day_of_week);
        `);

        console.log('Migration successful: collection_schedule cyclical upgrade.');
    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    }
};
