const pg = require('pg');
require('dotenv').config();
const pool = new pg.Pool({ connectionString: new URL(process.env.DATABASE_URL).toString() + '?sslmode=require' });

(async () => {
    try {
        const client = await pool.connect();
        const receiptRes = await client.query(`SELECT id, status FROM "GoodsReceipt" WHERE status = 'POSTED' LIMIT 1`);
        if (receiptRes.rows.length === 0) {
            console.log("No posted goods receipt found.");
            process.exit(0);
        }
        const receiptId = receiptRes.rows[0].id;
        console.log("Found POSTED receipt:", receiptId);

        const beforeBatches = await client.query(`SELECT id, "quantityTotal" FROM "ProductBatch" WHERE "goodsReceiptId" = $1`, [receiptId]);
        console.log("Batches before unpost:", beforeBatches.rows);

        // Run unpost logic
        await client.query('BEGIN');
        const deleteRes = await client.query(`DELETE FROM "ProductBatch" WHERE "goodsReceiptId" = $1`, [receiptId]);
        console.log("Deleted batches count:", deleteRes.rowCount);
        await client.query('ROLLBACK'); // rollback so we don't break their prod DB

    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
})();
