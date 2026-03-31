import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL + '?sslmode=require' });

async function run() {
    try {
        console.log("=== Finding Goods Receipt ===");
        const grRes = await pool.query(`SELECT id, number, date, status FROM "GoodsReceipt" WHERE number LIKE '%1103261%'`);
        console.log(grRes.rows);
        
        const prodRes = await pool.query(`SELECT id, name FROM "Product" WHERE name ILIKE '%Традиційний%МілКрай%брус%'`);
        console.log("Product:", prodRes.rows[0]);
        
        if (grRes.rows.length > 0 && prodRes.rows.length > 0) {
            const grId = grRes.rows[0].id;
            const prodId = prodRes.rows[0].id;
            
            const pbAll = await pool.query(`SELECT id, "quantityTotal", "quantityLeft", "goodsReceiptId" FROM "ProductBatch" WHERE "productId" = $1 ORDER BY "createdAt" DESC LIMIT 10`, [prodId]);
            console.log("Recent Batches for this product:", pbAll.rows);

            console.log("\nBatches matching GoodsReceipt ID:");
            const pbMatch = await pool.query(`SELECT id, "quantityTotal", "quantityLeft", "goodsReceiptId" FROM "ProductBatch" WHERE "goodsReceiptId" = $1`, [grId]);
            console.log(pbMatch.rows);
        }
    } catch(e) {
        console.error("ERROR", e);
    } finally {
        pool.end();
    }
}
run();
