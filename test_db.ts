import pool from './src/db.js';

async function test() {
    const client = await pool.connect();
    try {
        const pb = await client.query('SELECT * FROM "ProductBatch" LIMIT 1');
        console.log('ProductBatch:', pb.fields.map(f => f.name));
        const ob = await client.query('SELECT * FROM "OrderItemBatch" LIMIT 1');
        console.log('OrderItemBatch:', ob.fields.map(f => f.name));
        const oib = await client.query('SELECT * FROM "OrderItem" LIMIT 1');
        console.log('OrderItem:', oib.fields.map(f => f.name));
    } finally {
        client.release();
        process.exit(0);
    }
}
test();
