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
        const prodRes = await pool.query(`SELECT id, name FROM "Product" WHERE name ILIKE '%Традиційний%МілКрай%брус%'`);
        if (prodRes.rows.length > 0) {
            const prodId = prodRes.rows[0].id;

            // How is stock calculated?
            const stockRes = await pool.query(`
                SELECT 
                    SUM("quantityLeft") as stock
                FROM "ProductBatch"
                WHERE "productId" = $1
            `, [prodId]);
            console.log("Current calculated stock (from ProductBatches):", stockRes.rows[0]);
            
            // Check realized items
            const realized = await pool.query(`
                SELECT sum(ri.quantity) as sold
                FROM "RealizationItem" ri
                JOIN "Realization" r ON r.id = ri."realizationId"
                WHERE ri."productId" = $1 AND r.status = 'POSTED'
            `, [prodId]);
            console.log("Sold count:", realized.rows[0]);

            // Check if there are other receipts
            const grItems = await pool.query(`
                SELECT sum(gri.quantity) as received
                FROM "GoodsReceiptItem" gri
                JOIN "GoodsReceipt" gr ON gr.id = gri."goodsReceiptId"
                WHERE gri."productId" = $1 AND gr.status = 'POSTED'
            `, [prodId]);
            console.log("Received count (Posted only):", grItems.rows[0]);
            
            // Check if the specific receipt still affects stock somehow
             const specGRI = await pool.query(`
                SELECT gri.id, gri.quantity, gr.status
                FROM "GoodsReceiptItem" gri
                JOIN "GoodsReceipt" gr ON gr.id = gri."goodsReceiptId"
                WHERE gri."productId" = $1 AND gr.number LIKE '%1103261%'
            `, [prodId]);
            console.log("Specific Receipt Item info:", specGRI.rows);
        }
    } catch(e) {
        console.error("ERROR", e);
    } finally {
        pool.end();
    }
}
run();
