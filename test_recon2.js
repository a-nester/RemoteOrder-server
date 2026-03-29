import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL + '?sslmode=require' });

async function run() {
    const client = await pool.connect();
    try {
        const query = `
            WITH Ledger AS (
                SELECT 
                    r.id as "documentId",
                    r.date,
                    'SUPPLIER_RETURN' as "type",
                    r.number as "docNumber",
                    r."totalAmount" as "balanceChange",
                    r."totalAmount" as "debit",
                    0 as "credit",
                    r.comment,
                    r."supplierId" as "counterpartyId"
                FROM "SupplierReturn" r
            )
            SELECT 'ok' as msg FROM Ledger LIMIT 1
        `;
        const res = await client.query(query);
        console.log("Reconciliation Test OK");
        client.release();
        process.exit(0);
    } catch(e) {
        console.error("Test failed: ", e.message);
        process.exit(1);
    }
}
run();
