import pool from '../db.js';

export const runMigration = async () => {
    try {
        console.log('Running migration: Create collection_schedule table...');
        
        await pool.query(`
            -- Create collection_schedule table
            CREATE TABLE IF NOT EXISTS collection_schedule (
              id SERIAL PRIMARY KEY,
              date DATE NOT NULL,
              client_id INTEGER REFERENCES counterparties(id) ON DELETE CASCADE,
              status VARCHAR(20) DEFAULT 'planned',
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Add index on date for fast querying by week/day
            CREATE INDEX IF NOT EXISTS idx_collection_schedule_date ON collection_schedule(date);
            
            -- Add composite index to quickly load a client's plan
            CREATE INDEX IF NOT EXISTS idx_collection_schedule_client ON collection_schedule(client_id, date);
        `);

        console.log('Migration successful: collection_schedule table created.');
    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    }
};
