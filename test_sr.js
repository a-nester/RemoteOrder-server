import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL + '?sslmode=require' });

async function run() {
    const client = await pool.connect();
    try {
        const docRes = await client.query(`SELECT id, status, "totalAmount", "warehouseId" FROM "SupplierReturn" WHERE status = 'POSTED' ORDER BY "createdAt" DESC`);
        console.table(docRes.rows);

        const itemsRes = await client.query(`SELECT * FROM "SupplierReturnItem" WHERE "supplierReturnId" = $1`, [docRes.rows[0]?.id]);
        console.table(itemsRes.rows);

        client.release();
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
run();
