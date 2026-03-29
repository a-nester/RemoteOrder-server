import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL + '?sslmode=require' });

async function run() {
    const client = await pool.connect();
    try {
        const res = await client.query(`SELECT COUNT(*) FROM "SupplierReturnItemBatch";`);
        console.log("Count SupplierReturnItemBatch:", res.rows[0].count);

        const res2 = await client.query(`SELECT * FROM "SupplierReturnItemBatch";`);
        console.table(res2.rows);

        client.release();
        process.exit(0);
    } catch(e) {
        console.error(e.message);
        process.exit(1);
    }
}
run();
