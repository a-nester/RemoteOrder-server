import pool from './dist/db.js';
import { InventoryService } from './dist/services/inventoryService.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = await pool.connect();
  try {
    const res = await client.query(`SELECT id, "warehouseId" FROM "Realization" WHERE status = 'DRAFT' ORDER BY "updatedAt" DESC LIMIT 1`);
    if (res.rows.length === 0) return console.log("No drafted realization");
    const doc = res.rows[0];
    console.log("Latest drafted realization:", doc.id, "WarehouseId:", doc.warehouseId);

    const itemsRes = await client.query(`SELECT * FROM "RealizationItem" WHERE "realizationId" = $1`, [doc.id]);
    const items = itemsRes.rows;
    console.log(`Found ${items.length} items to deduct`);

    for (const item of items) {
       console.log(`Deducting ${item.quantity} of product ${item.productId} for warehouse ${doc.warehouseId}`);
       try {
           const pbCheck = await client.query(`
             SELECT pb.* FROM "ProductBatch" pb
             JOIN "GoodsReceipt" gr ON pb."goodsReceiptId" = gr.id
             WHERE pb."productId" = $1 
               AND pb."quantityLeft" > 0 
               AND gr."warehouseId" = $2
             ORDER BY pb."createdAt" ASC 
           `, [item.productId, doc.warehouseId]);
           console.log(`   Found ${pbCheck.rows.length} batches for this product in this warehouse.`);
           
           let remaining = item.quantity;
           for (const b of pbCheck.rows) remaining -= b.quantityLeft;
           if (remaining > 0) {
               console.log(`   WARNING: Not enough stock! Missing ${remaining}`);
           }
       } catch (e) {
           console.error(`   Error calculating deduct:`, e.message);
       }
    }
  } catch(e) { console.error(e); }
  finally { client.release(); pool.end(); }
}
run();
