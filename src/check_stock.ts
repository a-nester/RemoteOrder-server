import { connectDB, disconnectDB } from './db.js';
import pool from './db.js';
async function run() {
  await connectDB();
  const query = `
    WITH BatchIncoming AS (
        SELECT 
            pb."productId",
            SUM(CASE WHEN pb."createdAt"::date < $1::date THEN pb."quantityTotal" ELSE 0 END) as start_in,
            SUM(CASE WHEN pb."createdAt"::date >= $1::date AND pb."createdAt"::date <= $2::date THEN pb."quantityTotal" ELSE 0 END) as period_in
        FROM "ProductBatch" pb
        JOIN "GoodsReceipt" gr ON gr.id::text = pb."goodsReceiptId"::text
        WHERE gr."warehouseId"::text = $3
        GROUP BY pb."productId"
    ),
    BatchOutgoing AS (
        SELECT 
            pb."productId",
            SUM(CASE WHEN rib."createdAt"::date < $1::date THEN rib.quantity ELSE 0 END) as start_out,
            SUM(CASE WHEN rib."createdAt"::date >= $1::date AND rib."createdAt"::date <= $2::date THEN rib.quantity ELSE 0 END) as period_out
        FROM "RealizationItemBatch" rib
        JOIN "ProductBatch" pb ON pb.id::text = rib."productBatchId"::text
        JOIN "GoodsReceipt" gr ON gr.id::text = pb."goodsReceiptId"::text
        WHERE gr."warehouseId"::text = $3
        GROUP BY pb."productId"
    )
    SELECT 
        p.id as "productId",
        p.name as "productName",
        p.category as "productCategory",
        COALESCE(bi.start_in, 0) - COALESCE(bo.start_out, 0) as "startBalance",
        COALESCE(bi.period_in, 0) as "incoming",
        COALESCE(bo.period_out, 0) as "outgoing",
        (COALESCE(bi.start_in, 0) - COALESCE(bo.start_out, 0)) + COALESCE(bi.period_in, 0) - COALESCE(bo.period_out, 0) as "endBalance"
    FROM "Product" p
    LEFT JOIN BatchIncoming bi ON p.id::text = bi."productId"::text
    LEFT JOIN BatchOutgoing bo ON p.id::text = bo."productId"::text
    WHERE p."deleted" = false
    ORDER BY p.name ASC
    LIMIT 10;
  `;
  const res = await pool.query(query, ['2026-02-01', '2026-03-31', 'a7273ff1-c70c-4dc2-86e8-13412ec0b57b']);
  console.log("Movements:", res.rows);
  await disconnectDB();
}
run();
