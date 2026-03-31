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

            // Did the unposted GoodsReceipt have completely sold out batches?
            console.log("We cannot query the deleted batches directly, but let's see RealizationItemBatches.");
            const batches = await pool.query(`
                SELECT ri.id, ri.quantity, (
                    SELECT SUM(rib.quantity) FROM "RealizationItemBatch" rib WHERE rib."realizationItemId" = ri.id
                ) as matched_batches
                FROM "RealizationItem" ri
                WHERE ri."productId" = $1
            `, [prodId]);
            
            const missing = batches.rows.filter(r => Number(r.quantity) > Number(r.matched_batches || 0));
            console.log("Realization Items missing their batches (because of cascade delete):", missing.length, "items.");
            let missingQty = 0;
            for (let m of missing) missingQty += Number(m.quantity) - Number(m.matched_batches || 0);
            console.log("Total missing batch quantity:", missingQty);
        }
    } catch(e) {
        console.error("ERROR", e);
    } finally {
        pool.end();
    }
}
run();
