import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL + '?sslmode=require' });

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Find the product
        const pRes = await client.query(`SELECT id, name FROM "Product" WHERE name ILIKE '%Преміум 82,5% ТМ "МілКрай" 5 кг%'`);
        if (pRes.rows.length === 0) throw new Error("Product not found");
        const p = pRes.rows[0];
        
        // Find a batch that has at least 35 quantityTotal
        const batchRes = await client.query(`
            SELECT id, "quantityTotal" 
            FROM "ProductBatch" 
            WHERE "productId" = $1 AND "quantityTotal" >= 35
            ORDER BY "createdAt" DESC LIMIT 1
        `, [p.id]);

        if (batchRes.rows.length === 0) throw new Error("No batch found with >= 35kg");
        const batch = batchRes.rows[0];

        // Deduct 35 from both quantityTotal and quantityLeft
        const newTotal = parseFloat(batch.quantityTotal) - 35;
        
        await client.query(`
            UPDATE "ProductBatch" 
            SET "quantityTotal" = $1, "quantityLeft" = GREATEST(0, "quantityLeft" - 35)
            WHERE id = $2
        `, [newTotal, batch.id]);

        console.log(`Successfully deducted 35kg from batch ${batch.id} (New total: ${newTotal}kg)`);
        
        await client.query('COMMIT');
        client.release();
        process.exit(0);
    } catch(e) {
        await client.query('ROLLBACK');
        console.error(e);
        process.exit(1);
    }
}
run();
