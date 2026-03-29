import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('sslmode', 'require');
const pool = new pg.Pool({ connectionString: url.toString() });

async function run() {
    try {
        const client = await pool.connect();
        
        console.log("Checking GoodsReceiptItems for Goods Receipt 36c78363-4cdb-47b1-81cd-fd29153fe976:");
        const resGRI = await client.query(`
            SELECT gri.quantity, p.name
            FROM "GoodsReceiptItem" gri
            JOIN "Product" p ON p.id::text = gri."productId"
            WHERE gri."goodsReceiptId" = '36c78363-4cdb-47b1-81cd-fd29153fe976'
        `);
        console.log("Goods Receipt Items:", resGRI.rows);

        client.release();
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
run();
