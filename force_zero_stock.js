import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('sslmode', 'require');
const pool = new pg.Pool({ connectionString: url.toString() });

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // 1. Revert BuyerReturn to POSTED (so I don't "unpost" it)
        const id = 'c76c63a1-2859-474f-92b5-eb9bbaaf6ffc'; // BuyerReturn Id
        await client.query(`
            UPDATE "BuyerReturn" 
            SET "status" = 'POSTED', "updatedAt" = NOW() 
            WHERE id = $1
        `, [id]);
        
        // 2. We need to make sure the stock is strictly 0 for this product.
        // Let's find the Product ID first
        const pRes = await client.query(`SELECT id FROM "Product" WHERE name ILIKE '%Преміум 82,5% ТМ "МілКрай" 5 кг%'`);
        if (pRes.rows.length === 0) {
            console.log("Product not found");
            process.exit(1);
        }
        const productId = pRes.rows[0].id;

        // Force ALL existing ProductBatches for this product to quantityLeft = 0
        const res = await client.query(`
            UPDATE "ProductBatch"
            SET "quantityLeft" = 0
            WHERE "productId" = $1 AND "quantityLeft" > 0;
        `, [productId]);

        console.log(`Zeroed out ${res.rowCount} batches for product ${productId}`);
        
        await client.query('COMMIT');
        client.release();
        process.exit(0);
    } catch(e) {
        await client.query('ROLLBACK');
        console.error(e);
        process.exit(1);
    }
}
run();
