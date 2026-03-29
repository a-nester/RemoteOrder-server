import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('sslmode', 'require');
const pool = new pg.Pool({ connectionString: url.toString() });

async function run() {
    try {
        const client = await pool.connect();
        
        console.log("Checking the specific BuyerReturn properties:");
        const resBR = await client.query(`
            SELECT br.id, br.number as "docNumber", br."date", br.status, c.name, br."warehouseId"
            FROM "BuyerReturn" br
            JOIN "Counterparty" c ON c.id = br."counterpartyId"
            WHERE br.id = 'c76c63a1-2859-474f-92b5-eb9bbaaf6ffc'
        `);
        console.log("Buyer Returns:", resBR.rows);

        client.release();
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
run();
