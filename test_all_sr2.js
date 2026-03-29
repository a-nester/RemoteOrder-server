import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL + '?sslmode=require' });

async function run() {
    const client = await pool.connect();
    try {
        const docRes = await client.query(`SELECT id, "number", status, "totalAmount", "warehouseId", "date" FROM "SupplierReturn" ORDER BY "createdAt" DESC`);
        console.table(docRes.rows);

        client.release();
        process.exit(0);
    } catch(e) {
        console.error(e.message);
        process.exit(1);
    }
}
run();
