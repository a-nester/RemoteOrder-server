import pool from "./db.js";

async function test() {
    try {
        const client = await pool.connect();
        const res = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
        console.log(res.rows.map((r: any) => r.table_name));
        
        const cols = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ProductBatch'`);
        console.log(cols.rows);

        const batches = await client.query(`SELECT * FROM "ProductBatch" LIMIT 1`);
        console.log(batches.rows);

        client.release();
    } catch(e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
test();
