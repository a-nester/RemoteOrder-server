import pool from './src/db.js';

async function test() {
    const client = await pool.connect();
    try {
        const pb = await client.query('SELECT count(*) as count FROM "ProductBatch"');
        console.log('ProductBatch Count:', pb.rows[0].count);

        const gr = await client.query('SELECT count(*) as count FROM "GoodsReceipt"');
        console.log('GoodsReceipt Count:', gr.rows[0].count);

        const w = await client.query('SELECT count(*) as count FROM "Warehouse"');
        console.log('Warehouse Count:', w.rows[0].count);

        const p = await client.query('SELECT count(*) as count FROM "Product"');
        console.log('Product Count:', p.rows[0].count);

        // Run the main report query for current date
        const query = `
            WITH BatchBalances AS (
                SELECT 
                    pb.id as batch_id,
                    pb."productId",
                    gr."warehouseId",
                    CASE WHEN pb."createdAt" <= $1 THEN pb."quantityTotal" ELSE 0 END as incoming,
                    COALESCE(
                        (SELECT SUM(oib.quantity) 
                         FROM "OrderItemBatch" oib 
                         WHERE oib."productBatchId"::text = pb.id::text AND oib."createdAt" <= $1
                        ), 0) as outgoing
                FROM "ProductBatch" pb
                LEFT JOIN "GoodsReceipt" gr ON gr.id::text = pb."goodsReceiptId"::text
                WHERE 1=1 
            )
            SELECT 
                bb."productId",
                p.name as "productName",
                p.category as "productCategory",
                w.name as "warehouseName",
                SUM(bb.incoming - bb.outgoing) as balance
            FROM BatchBalances bb
            LEFT JOIN "Product" p ON p.id::text = bb."productId"::text
            LEFT JOIN "Warehouse" w ON w.id::text = bb."warehouseId"::text
            GROUP BY bb."productId", p.name, p.category, bb."warehouseId", w.name
            HAVING SUM(bb.incoming - bb.outgoing) != 0
            ORDER BY w.name, p.name
        `;
        const res = await client.query(query, [new Date()]);
        console.log('Report Rows:', res.rows);

        // Let's examine a raw row
        const raw_pb = await client.query(`
            SELECT pb.id, pb."productId", pb."createdAt", pb."quantityTotal", pb."goodsReceiptId" 
            FROM "ProductBatch" pb LIMIT 5
        `);
        console.log('Raw ProductBatches:', raw_pb.rows);

    } finally {
        client.release();
        process.exit(0);
    }
}
test();
