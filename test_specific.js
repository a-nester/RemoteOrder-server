import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL + '?sslmode=require' });

async function run() {
    const client = await pool.connect();
    try {
        const id = 'ce41b23a-08d3-4774-8ed2-76c72429138b';
        const docRes = await client.query(`SELECT status, "totalAmount", "warehouseId", "supplierId" FROM "SupplierReturn" WHERE id = $1`, [id]);
        console.table(docRes.rows);

        const itemsRes = await client.query(`SELECT * FROM "SupplierReturnItem" WHERE "supplierReturnId" = $1`, [id]);
        console.table(itemsRes.rows);

        client.release();
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
run();
