
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
});

async function run() {
    try {
        console.log('Connecting...');
        const client = await pool.connect();
        console.log('Connected!');

        console.log('Adding roundingValue column to PriceDocument table...');

        // Add column if not exists
        await client.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_name='PriceDocument' AND column_name='roundingValue') THEN 
                    ALTER TABLE "PriceDocument" ADD COLUMN "roundingValue" FLOAT DEFAULT NULL; 
                END IF; 
            END $$;
        `);

        console.log('Column added successfully or already exists.');

        client.release();
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
        console.log('Pool ended.');
    }
}

run();
