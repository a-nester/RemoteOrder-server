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
        console.log("=== Finding Product Batches ===");
        const pbRes = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'ProductBatch'`);
        console.log("Columns:", pbRes.rows.map(r => r.column_name).join(', '));
        
        console.log("\n=== Checking specific product ===");
        const prodRes = await pool.query(`SELECT id, name FROM "Product" WHERE name ILIKE '%МілКрай брус%'`);
        console.log("Products found:", prodRes.rows.map(p => p.name).join(", "));
        
        if (prodRes.rows.length > 0) {
            const prodId = prodRes.rows[0].id;
            const allBatches = await pool.query(`SELECT id, quantity, "currentQuantity", "goodsReceiptId" FROM "ProductBatch" WHERE "productId" = $1 ORDER BY "createdAt" DESC LIMIT 5`, [prodId]);
            console.log("Recent batches for product:", allBatches.rows);
        }
    } catch(e) {
        console.error("ERROR", e);
    } finally {
        pool.end();
    }
}
run();
