import pool from '../db.js';

export async function runMigration() {
    console.log('🔄 Running migration: Backfill buyerReturnId in ProductBatch...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const result = await client.query(`
            UPDATE "ProductBatch" pb
            SET "buyerReturnId" = bri."buyerReturnId"
            FROM "BuyerReturnItemBatch" brib
            JOIN "BuyerReturnItem" bri ON bri.id = brib."buyerReturnItemId"
            WHERE pb.id = brib."productBatchId" 
              AND pb."buyerReturnId" IS NULL;
        `);

        console.log(`✅ Backfilled buyerReturnId for ${result.rowCount} old batches.`);

        await client.query('COMMIT');
        console.log('🎉 Migration V15 successful!');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}
