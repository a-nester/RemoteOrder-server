import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('sslmode', 'require');
const pool = new pg.Pool({ connectionString: url.toString() });

async function run() {
    const client = await pool.connect();
    try {
        const id = 'c76c63a1-2859-474f-92b5-eb9bbaaf6ffc'; // BuyerReturn Id
        await client.query('BEGIN');
        
        console.log('Unposting BuyerReturn', id);

        // Delete ProductBatch records linked to this buyerReturn
        await client.query(`DELETE FROM "ProductBatch" WHERE "buyerReturnId" = $1`, [id]);
        
        // Delete all legacy linkage batches
        const itemBatchesRes = await client.query(`
            SELECT brib."productBatchId"
            FROM "BuyerReturnItemBatch" brib
            JOIN "BuyerReturnItem" bri ON bri.id = brib."buyerReturnItemId"
            WHERE bri."buyerReturnId" = $1
        `, [id]);
        for (const row of itemBatchesRes.rows) {
            await client.query(`DELETE FROM "ProductBatch" WHERE id = $1`, [row.productBatchId]);
        }
        await client.query(`
            DELETE FROM "BuyerReturnItemBatch"
            WHERE "buyerReturnItemId" IN (SELECT id FROM "BuyerReturnItem" WHERE "buyerReturnId" = $1)
        `, [id]);

        // Mark as DRAFT
        await client.query(`
            UPDATE "BuyerReturn" 
            SET "status" = 'DRAFT', "profit" = 0, "updatedAt" = NOW() 
            WHERE id = $1
        `, [id]);

        await client.query('COMMIT');
        console.log('Successfully set to DRAFT (0kg).');
        client.release();
        process.exit(0);
    } catch(e) {
        await client.query('ROLLBACK');
        console.error(e);
        process.exit(1);
    }
}
run();
