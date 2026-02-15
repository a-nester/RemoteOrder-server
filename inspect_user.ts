import pool from './src/db.js';

async function inspect() {
    const client = await pool.connect();
    try {
        console.log('Inspecting User table DATA...');
        console.log('Inspecting PriceType table DATA...');
        const res = await client.query(`SELECT * FROM "PriceType" LIMIT 1`);
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        client.release();
        await pool.end();
    }
}

inspect();
