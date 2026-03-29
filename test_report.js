import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL + '?sslmode=require' });

async function run() {
    const client = await pool.connect();
    try {
        const query = `
            WITH BatchBalances AS (
                SELECT 
                    pb.id as batch_id,
                    pb."productId",
                    COALESCE(gr."warehouseId", br."warehouseId") as "warehouseId",
                    pb."enterPrice",
                    CASE WHEN COALESCE(gr."date", br."date") < ('2026-12-31'::date + interval '1 day') THEN pb."quantityTotal" ELSE 0 END as incoming,
                    COALESCE(
                        (SELECT SUM(rib.quantity) 
                         FROM "RealizationItemBatch" rib 
                         JOIN "RealizationItem" ri ON ri.id = rib."realizationItemId"
                         JOIN "Realization" r ON r.id = ri."realizationId"
                         WHERE rib."productBatchId"::text = pb.id::text AND r."date" < ('2026-12-31'::date + interval '1 day')
                        ), 0) +
                    COALESCE(
                        (SELECT SUM(srib.quantity) 
                         FROM "SupplierReturnItemBatch" srib
                         JOIN "SupplierReturnItem" sri ON sri.id = srib."supplierReturnItemId"
                         JOIN "SupplierReturn" sr ON sr.id = sri."supplierReturnId"
                         WHERE srib."productBatchId"::text = pb.id::text AND sr."date" < ('2026-12-31'::date + interval '1 day')
                        ), 0) as outgoing
                FROM "ProductBatch" pb
                LEFT JOIN "GoodsReceipt" gr ON gr.id::text = pb."goodsReceiptId"::text
                LEFT JOIN "BuyerReturn" br ON br.id::text = pb."buyerReturnId"::text
            )
            SELECT 
                bb."productId",
                p.name as "productName",
                p.category as "productCategory",
                SUM(bb.incoming - bb.outgoing) as balance
            FROM BatchBalances bb
            LEFT JOIN "Product" p ON p.id::text = bb."productId"::text
            WHERE p.name ILIKE '%МілКрай%'
            GROUP BY bb."productId", p.name, p.category
            HAVING SUM(bb.incoming - bb.outgoing) != 0
        `;
        const res = await client.query(query);
        console.table(res.rows);

        client.release();
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
run();
