import pool from './dist/db.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = await pool.connect();
  try {
    const productId = '460382af-86e7-4b87-a4e2-500914f20ab7';
    
    // Total stock in ProductBatch
    const pb = await client.query(`SELECT "quantityLeft", "goodsReceiptId" FROM "ProductBatch" WHERE "productId" = $1 AND "quantityLeft" > 0`, [productId]);
    console.log("Batches for this product:", pb.rows);
    
    for (const row of pb.rows) {
      if (row.goodsReceiptId) {
        const gr = await client.query(`SELECT "warehouseId" FROM "GoodsReceipt" WHERE id = $1`, [row.goodsReceiptId]);
        console.log("Warehouse for GR", row.goodsReceiptId, ":", gr.rows[0]?.warehouseId);
      } else {
        console.log("No GR for this batch!");
      }
    }
  } catch(e) { console.error(e); }
  finally { client.release(); pool.end(); }
}
run();
