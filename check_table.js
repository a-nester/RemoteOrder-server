import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL + '?sslmode=require' });

async function run() {
    const client = await pool.connect();
    try {
        const res = await client.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'SupplierReturnItemBatch';
        `);
        console.table(res.rows);
        client.release();
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
run();
