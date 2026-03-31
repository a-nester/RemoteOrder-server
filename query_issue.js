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
        
        if (grRes.rows.length > 0) {
            const grId = grRes.rows[0].id;
            console.log("\n=== Finding Product Batches ===");
            const pbRes = await pool.query(`SELECT * FROM "ProductBatch" WHERE "goodsReceiptId" = $1 OR "initialQuantity" = 55.928`, [grId]);
            console.log(pbRes.rows);
            
            console.log("\n=== Checking specific product ===");
            const prodRes = await pool.query(`SELECT id, name FROM "Product" WHERE name ILIKE '%МілКрай%'`);
            console.log("Products found:", prodRes.rows.map(p => p.name).join(", "));
            
            if (prodRes.rows.length > 0) {
                const prodId = prodRes.rows[0].id;
                const stockRes = await pool.query(`SELECT SUM("currentQuantity") as stock FROM "ProductBatch" WHERE "productId" = $1`, [prodId]);
                console.log("Current calculated stock:", stockRes.rows[0]);
                
                const allBatches = await pool.query(`SELECT id, "initialQuantity", "currentQuantity", "goodsReceiptId" FROM "ProductBatch" WHERE "productId" = $1`, [prodId]);
                console.log("All batches for product:", allBatches.rows);
            }
        }
    } catch(e) {
        console.error("ERROR", e);
    } finally {
        pool.end();
    }
}
run();
