import pool from '../db.js';

export const runMigration = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Recalculate Realization profit with vatCostCoefficient for salesType = 'з ПДВ'
    const resRealization = await client.query(`
      UPDATE "Realization" r
      SET "profit" = r.amount - COALESCE((
          SELECT SUM(rib.quantity * rib."enterPrice" * CASE WHEN r."salesType" = 'з ПДВ' THEN COALESCE((SELECT "vatCostCoefficient" FROM "Organization" LIMIT 1), 1.0) ELSE 1.0 END)
          FROM "RealizationItem" ri
          JOIN "RealizationItemBatch" rib ON rib."realizationItemId" = ri.id
          WHERE ri."realizationId" = r.id
      ), 0)
      WHERE r.status = 'POSTED';
    `);

    // Recalculate BuyerReturn profit
    const resBuyerReturn = await client.query(`
      UPDATE "BuyerReturn" br
      SET "profit" = -((COALESCE((
          SELECT pb."enterPrice"
          FROM "BuyerReturnItem" bri
          JOIN "BuyerReturnItemBatch" brib ON brib."buyerReturnItemId" = bri.id
          JOIN "ProductBatch" pb ON pb.id = brib."productBatchId"
          WHERE bri."buyerReturnId" = br.id
          LIMIT 1
      ), 0) * (SELECT COALESCE(SUM(quantity), 0) FROM "BuyerReturnItem" WHERE "buyerReturnId" = br.id)) - br."totalAmount")
      WHERE br.status = 'POSTED';
    `);

    await client.query('COMMIT');
    console.log(`✅ Migration 110 applied: Recalculated profit for ${resRealization.rowCount} realizations and ${resBuyerReturn.rowCount} buyer returns`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 110 failed:', error);
    throw error;
  } finally {
    client.release();
  }
};
