import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL + '?sslmode=require' });

async function run() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const pRes = await client.query(`SELECT id, name FROM "Product" WHERE name ILIKE '%Преміум 82,5% ТМ "МілКрай" 5 кг%'`);
        const p = pRes.rows[0];
        console.log("Product:", p.name);

        // 1. Restore exact quantityLeft for all batches
        const batchesRes = await client.query(`SELECT id, "quantityTotal" FROM "ProductBatch" WHERE "productId" = $1`, [p.id]);
        
        let totalRestored = 0;
        for (const batch of batchesRes.rows) {
            // Find how much was sold from this batch
            const soldRes = await client.query(`
                SELECT COALESCE(SUM(quantity), 0) as sold 
                FROM "RealizationItemBatch" 
                WHERE "productBatchId" = $1
            `, [batch.id]);
            const sold = parseFloat(soldRes.rows[0].sold);
            const total = parseFloat(batch.quantityTotal);
            let restoredLeft = total - sold;
            if (restoredLeft < 0) restoredLeft = 0; // Just in case
            
            await client.query(`UPDATE "ProductBatch" SET "quantityLeft" = $1 WHERE id = $2`, [restoredLeft, batch.id]);
            totalRestored += restoredLeft;
        }
        
        console.log("Restored Total Left calculated:", totalRestored);

        // 2. Reduce exactly 35kg from one of the batches (or across multiple if needed)
        // Let's find batches with quantityLeft > 0, ordered by newest first
        const availableBatchesRes = await client.query(`
            SELECT id, "quantityLeft" 
            FROM "ProductBatch" 
            WHERE "productId" = $1 AND "quantityLeft" > 0
            ORDER BY "createdAt" DESC
        `, [p.id]);

        let remainingToDeduct = 35;
        for (const batch of availableBatchesRes.rows) {
            if (remainingToDeduct <= 0) break;
            
            const qLeft = parseFloat(batch.quantityLeft);
            let deduct = Math.min(qLeft, remainingToDeduct);
            
            await client.query(`
                UPDATE "ProductBatch" 
                SET "quantityLeft" = "quantityLeft" - $1
                WHERE id = $2
            `, [deduct, batch.id]);
            
            remainingToDeduct -= deduct;
            console.log(`Deducted ${deduct}kg from batch ${batch.id}`);
        }

        if (remainingToDeduct > 0) {
            console.log(`WARNING: Could not deduct all 35kg. Remaining: ${remainingToDeduct}kg`);
        } else {
            console.log("Successfully deducted exactly 35kg.");
        }

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
