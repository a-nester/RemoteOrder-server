import pool from '../db.js';

export const runMigration = async () => {
    try {
        const checkRes = await pool.query(`SELECT id FROM "Warehouse" ORDER BY "createdAt" ASC LIMIT 1`);
        if ((checkRes.rowCount || 0) > 0) {
            const firstWarehouseId = checkRes.rows[0].id;
            const queries = [
                `UPDATE "Order" SET "warehouseId" = $1 WHERE "warehouseId" IS NULL`,
                `UPDATE "GoodsReceipt" SET "warehouseId" = $1 WHERE "warehouseId" IS NULL`,
                `UPDATE "BuyerReturn" SET "warehouseId" = $1 WHERE "warehouseId" IS NULL`,
                `UPDATE "SupplierReturn" SET "warehouseId" = $1 WHERE "warehouseId" IS NULL`,
                `UPDATE "Realization" SET "warehouseId" = $1 WHERE "warehouseId" IS NULL`
            ];
            for (const q of queries) {
                await pool.query(q, [firstWarehouseId]);
            }
            console.log('Migration: Backfilled missing warehouseId applied successfully.');
        } else {
            console.log('Migration: No warehouses available, skipping warehouseId backfill.');
        }
    } catch (error) {
        console.error('Failed backfilling warehouse:', error);
    }
};
