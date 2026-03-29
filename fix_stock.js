import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('sslmode', 'require');
const pool = new pg.Pool({ connectionString: url.toString() });

async function run() {
    try {
        const client = await pool.connect();
        
        console.log("Checking ProductBatch where name like 'Преміум 82,5% ТМ \"МілКрай\"'...");
        const res = await client.query(`
            SELECT pb.id, pb."productId", pb."quantityTotal", pb."quantityLeft", pb."goodsReceiptId", pb."buyerReturnId", p.name, pb."createdAt"
            FROM "ProductBatch" pb
            JOIN "Product" p ON p.id = pb."productId"
            WHERE p.name ILIKE '%Преміум 82,5% ТМ%'
            ORDER BY pb."createdAt" DESC LIMIT 10
        `);
        console.log("Product batches:", res.rows);

        client.release();
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
run();
