const pg = require('pg');
require('dotenv').config();
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('sslmode', 'require');
const pool = new pg.Pool({ connectionString: url.toString() });

(async () => {
    try {
        const query = `
            WITH BaseDocs AS (
                SELECT 
                    "counterpartyId",
                    id,
                    amount as "netAmount",
                    profit as "netProfit"
                FROM "Realization" 
                WHERE status = 'POSTED'
                
                UNION ALL
                
                SELECT 
                    "counterpartyId",
                    id,
                    -"totalAmount" as "netAmount",
                    profit as "netProfit"
                FROM "BuyerReturn"
                WHERE status = 'POSTED'
            )
            SELECT 
                c.name as "clientName",
                SUM(bd."netAmount") as "totalAmount",
                SUM(bd."netProfit") as "totalProfit"
            FROM BaseDocs bd
            LEFT JOIN "Counterparty" c ON bd."counterpartyId" = c.id
            GROUP BY c.id, c.name
        `;
        const res = await pool.query(query);
        console.log('SALES BY CLIENT:', res.rows);

        const brRes = await pool.query('SELECT id, number, date, status, "totalAmount", profit FROM "BuyerReturn"');
        console.log('ALL BUYER RETURNS:', brRes.rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
})();
