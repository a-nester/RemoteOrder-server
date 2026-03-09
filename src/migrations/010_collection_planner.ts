import pool from '../db.js';

export const runMigration = async () => {
    try {
        console.log('Running migration: Create collection_schedule table...');
        
        await pool.query(`
            -- Create collection_schedule table
            CREATE TABLE IF NOT EXISTS collection_schedule (
              id SERIAL PRIMARY KEY,
              client_id UUID REFERENCES "Counterparty"(id) ON DELETE CASCADE,
              status VARCHAR(20) DEFAULT 'planned',
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Add day_of_week column if it doesn't exist
            ALTER TABLE collection_schedule ADD COLUMN IF NOT EXISTS day_of_week SMALLINT CHECK (day_of_week BETWEEN 1 AND 7);

            -- Add new indices
            CREATE INDEX IF NOT EXISTS idx_collection_schedule_day ON collection_schedule(day_of_week);
            CREATE INDEX IF NOT EXISTS idx_collection_schedule_client_day ON collection_schedule(client_id, day_of_week);
        `);

        console.log('Migration successful: collection_schedule table created.');
    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    }
};
