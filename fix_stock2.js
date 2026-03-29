import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('sslmode', 'require');
const pool = new pg.Pool({ connectionString: url.toString() });

async function run() {
    try {
        const client = await pool.connect();
        
        console.log("Checking GoodsReceipt for Vasylkivskyi:");
        const resGR = await client.query(`
            SELECT gr.id, gr."docNumber", gr."date", gr.status, c.name
            FROM "GoodsReceipt" gr
            JOIN "Counterparty" c ON c.id = gr."providerId"
            WHERE c.name ILIKE '%Васильк%'
        `);
        console.log("Goods Receipts:", resGR.rows);

        console.log("Checking BuyerReturn for Vasylkivskyi:");
        const resBR = await client.query(`
            SELECT br.id, br.number as "docNumber", br."date", br.status, c.name, br."warehouseId"
            FROM "BuyerReturn" br
            JOIN "Counterparty" c ON c.id = br."counterpartyId"
            WHERE c.name ILIKE '%Васильк%'
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
