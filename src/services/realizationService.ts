import pool from '../db.js';
import { InventoryService } from './inventoryService.js';

export class RealizationService {
    static async post(id: string) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const docRes = await client.query('SELECT * FROM "Realization" WHERE id = $1 FOR UPDATE', [id]);
            if (docRes.rowCount === 0) throw new Error('Realization not found');
            const doc = docRes.rows[0];

            if (doc.status === 'POSTED') {
                throw new Error('Realization is already POSTED');
            }

            const itemsRes = await client.query('SELECT * FROM "RealizationItem" WHERE "realizationId" = $1', [id]);
            const items = itemsRes.rows;

            let totalCostPrice = 0;
            let totalSellPrice = Number(doc.amount);

            for (const item of items) {
                const productId = item.productId;
                const quantityNeeded = Number(item.quantity);

                const deductions = await InventoryService.deductStock(client, productId, quantityNeeded, doc.warehouseId);

                for (const deduction of deductions) {
                    await client.query(`
                        INSERT INTO "RealizationItemBatch" ("realizationItemId", "productBatchId", "quantity", "enterPrice")
                        VALUES ($1, $2, $3, $4)
                    `, [item.id, deduction.batchId, deduction.quantity, deduction.enterPrice]);

                    totalCostPrice += (deduction.quantity * deduction.enterPrice);
                }
            }

            const profit = totalSellPrice - totalCostPrice;
            let statusComment = doc.comment ? doc.comment + ' ' : '';
            if (profit < 0) statusComment += '[WARNING: Negative Profit]';

            await client.query(`
                UPDATE "Realization"
                SET "status" = 'POSTED', "profit" = $1, "comment" = $2, "updatedAt" = NOW()
                WHERE id = $3
            `, [profit, statusComment.trim() || null, id]);

            if (doc.orderId) {
                await client.query(`UPDATE "Order" SET "status" = 'COMPLETED', "updatedAt" = NOW() WHERE "id" = $1`, [doc.orderId]);
            }

            await client.query('COMMIT');
            return { success: true, profit };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async unpost(id: string) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const docRes = await client.query('SELECT * FROM "Realization" WHERE id = $1 FOR UPDATE', [id]);
            if (docRes.rowCount === 0) throw new Error('Realization not found');
            const realization = docRes.rows[0];

            if (realization.status !== 'POSTED')
                throw new Error('Only POSTED realizations can be unposted');

            await InventoryService.returnStock(client, id);

            await client.query(`
                DELETE FROM "RealizationItemBatch"
                WHERE "realizationItemId" IN (
                    SELECT id FROM "RealizationItem"
                    WHERE "realizationId" = $1
                )
            `, [id]);

            const resetProfit = realization.profit !== undefined ? 0 : null;

            await client.query(`
                UPDATE "Realization"
                SET status = 'DRAFT',
                    profit = $1,
                    "updatedAt" = NOW()
                WHERE id = $2
            `, [resetProfit, id]);

            if (realization.orderId) {
                await client.query(`UPDATE "Order" SET "status" = 'ACCEPTED', "updatedAt" = NOW() WHERE "id" = $1`, [realization.orderId]);
            }

            await client.query('COMMIT');
            return { success: true };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}
