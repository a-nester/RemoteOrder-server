import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set('sslmode', 'require');
const pool = new pg.Pool({ connectionString: url.toString() });

async function check() {
    const res = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'ProductBatch'`);
    console.log("Columns:", res.rows.map(r => r.column_name));
    
    // Check if goodsReceiptId is properly saved
    const pb = await pool.query(`SELECT "goodsReceiptId", "quantityTotal", "quantityLeft" FROM "ProductBatch" LIMIT 5`);
    console.log("Batches:", pb.rows);
    process.exit(0);
}
check();
