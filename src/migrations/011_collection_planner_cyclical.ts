import pool from '../db.js';

export const runMigration = async () => {
    try {
        console.log('Running migration: collection_schedule cyclical upgrade...');
        
        await pool.query(`
            -- Clear existing data as schema is changing significantly
            TRUNCATE TABLE collection_schedule;

            -- Drop old indices
            DROP INDEX IF EXISTS idx_collection_schedule_date;
            DROP INDEX IF EXISTS idx_collection_schedule_client;

            -- Alter table
            ALTER TABLE collection_schedule DROP COLUMN date;
            ALTER TABLE collection_schedule ADD COLUMN day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7);

            -- Add new indices
            CREATE INDEX idx_collection_schedule_day ON collection_schedule(day_of_week);
            CREATE INDEX idx_collection_schedule_client_day ON collection_schedule(client_id, day_of_week);
        `);

        console.log('Migration successful: collection_schedule cyclical upgrade.');
    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    }
};
