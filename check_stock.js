import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL + '?sslmode=require' });

async function run() {
    const client = await pool.connect();
    try {
        const pRes = await client.query(`SELECT id, name FROM "Product" WHERE name ILIKE '%Преміум 82,5% ТМ "МілКрай" 5 кг%'`);
        const p = pRes.rows[0];
        
        const sumRes = await client.query(`SELECT SUM("quantityLeft") as total FROM "ProductBatch" WHERE "productId" = $1`, [p.id]);
        
        console.log(`Current Total Stock for ${p.name}: ${sumRes.rows[0].total}`);

        client.release();
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
run();
