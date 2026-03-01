import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    // Let's find a drafted realization
    const res = await client.query(`SELECT * FROM "Realization" WHERE status = 'DRAFT' LIMIT 1`);
    if (res.rows.length === 0) {
      console.log('No DRAFT realization found');
      return;
    }
    const doc = res.rows[0];
    console.log('Trying to post Realization:', doc.id, 'Warehouse:', doc.warehouseId);
    
    const itemsRes = await client.query(`SELECT * FROM "RealizationItem" WHERE "realizationId" = $1`, [doc.id]);
    const items = itemsRes.rows;
    
    for (const item of items) {
       console.log('Item:', item.productId, 'Qty:', item.quantity);
       
       const batches = await client.query(`
             SELECT pb.* FROM "ProductBatch" pb
             JOIN "GoodsReceipt" gr ON pb."goodsReceiptId" = gr.id
             WHERE pb."productId" = $1 
               AND pb."quantityLeft" > 0 
               AND gr."warehouseId" = $2
       `, [item.productId, doc.warehouseId]);
       
       console.log('Found batches:', batches.rows.length);
       if (batches.rows.length > 0) {
         console.log(batches.rows);
       } else {
         console.log('NO BATCHES FOUND! Why?');
         // Let's check without warehouse filter
         const allBatches = await client.query(`SELECT * FROM "ProductBatch" WHERE "productId" = $1 AND "quantityLeft" > 0`, [item.productId]);
         console.log('All batches for product:', allBatches.rows);
         if (allBatches.rows.length > 0) {
             const grId = allBatches.rows[0].goodsReceiptId;
             if (grId) {
                 const gr = await client.query(`SELECT * FROM "GoodsReceipt" WHERE id = $1`, [grId]);
                 console.log('Associated GoodsReceipt:', gr.rows[0]);
             } else {
                 console.log('Batch has no GoodsReceiptId!');
             }
         }
       }
    }
  } catch (e) {
    console.error(e);
  } finally {
    client.release();
    pool.end();
  }
}
run();
