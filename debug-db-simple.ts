
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

        console.log('--- Price Types ---');
        const priceTypes = await client.query('SELECT id, name, slug FROM "PriceType"');
        console.table(priceTypes.rows);

        console.log('\n--- Products (Top 5) ---');
        const products = await client.query('SELECT id, name, prices FROM "Product" LIMIT 5');
        console.log(JSON.stringify(products.rows, null, 2));

        client.release();
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
        console.log('Pool ended.');
    }
}

run();
