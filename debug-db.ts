
import pool from './src/db.js';

async function run() {
    try {
        console.log('--- Price Types ---');
        const priceTypes = await pool.query('SELECT id, name, slug FROM "PriceType"');
        console.table(priceTypes.rows);

        console.log('\n--- Products (Top 5) ---');
        const products = await pool.query('SELECT id, name, prices FROM "Product" LIMIT 5');
        console.log(JSON.stringify(products.rows, null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

run();
