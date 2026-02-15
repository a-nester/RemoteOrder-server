
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('Creating CounterpartyGroup table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS "CounterpartyGroup" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "name" VARCHAR(255) NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "isDeleted" BOOLEAN DEFAULT FALSE
            );
        `);

        console.log('Creating Counterparty table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS "Counterparty" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "name" VARCHAR(255) NOT NULL,
                "address" TEXT,
                "phone" VARCHAR(50),
                "contactPerson" VARCHAR(255),
                "isBuyer" BOOLEAN DEFAULT FALSE,
                "isSeller" BOOLEAN DEFAULT FALSE,
                "priceTypeId" UUID REFERENCES "PriceType"("id"),
                "groupId" UUID REFERENCES "CounterpartyGroup"("id"),
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "isDeleted" BOOLEAN DEFAULT FALSE
            );
        `);

        await client.query('COMMIT');
        console.log('Migration completed successfully');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
