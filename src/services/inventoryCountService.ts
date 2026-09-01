import pool from '../db.js';
import { InventoryService } from './inventoryService.js';
import { AuditService } from './auditService.js';

const round3 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

export class InventoryCountService {
    /**
     * Get stock balances for selected warehouse to populate inventory count items
     */
    static async getStockForWarehouse(warehouseId: string) {
        const query = `
            SELECT 
                p.id as "productId",
                p.name as "productName",
                p.code as "productCode",
                p.unit,
                COALESCE(p."enterPrice", 0) as "price",
                COALESCE(SUM(pb."quantityLeft"), 0) as "accountingQty"
            FROM "Product" p
            LEFT JOIN "ProductBatch" pb ON pb."productId" = p.id AND pb."quantityLeft" > 0
            LEFT JOIN "GoodsReceipt" gr ON pb."goodsReceiptId" = gr.id
            LEFT JOIN "BuyerReturn" br ON pb."buyerReturnId" = br.id
            WHERE (COALESCE(gr."warehouseId", br."warehouseId") = $1 OR pb.id IS NULL)
              AND p."isDeleted" = FALSE
            GROUP BY p.id, p.name, p.code, p.unit, p."enterPrice"
            ORDER BY p.name ASC
        `;
        const res = await pool.query(query, [warehouseId]);
        return res.rows.map(r => ({
            ...r,
            accountingQty: round3(Number(r.accountingQty)),
            price: Number(r.price)
        }));
    }

    /**
     * Post inventory count document
     */
    static async post(inventoryCountId: string, userId: string, userDetails?: any) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const docRes = await client.query(
                'SELECT * FROM "InventoryCount" WHERE id = $1 FOR UPDATE', 
                [inventoryCountId]
            );
            if (docRes.rows.length === 0) throw new Error('Документ інвентаризації не знайдено');
            
            const doc = docRes.rows[0];
            if (doc.status === 'POSTED') throw new Error('Документ вже проведено');

            const itemsRes = await client.query(
                'SELECT * FROM "InventoryCountItem" WHERE "inventoryCountId" = $1 ORDER BY "sortOrder" ASC', 
                [inventoryCountId]
            );
            const items = itemsRes.rows;

            for (const item of items) {
                const diffQty = round3(Number(item.actualQty) - Number(item.accountingQty));
                const price = Number(item.price);

                if (diffQty > 0) {
                    // Surplus: Add stock batch
                    await InventoryService.addStock(
                        client, 
                        item.productId, 
                        diffQty, 
                        price, 
                        undefined, 
                        new Date()
                    );
                } else if (diffQty < 0) {
                    // Shortage: Deduct stock batch using FIFO
                    const shortageQty = Math.abs(diffQty);
                    await InventoryService.deductStock(
                        client, 
                        item.productId, 
                        shortageQty, 
                        doc.warehouseId
                    );
                }
            }

            // Update status to POSTED
            await client.query(`
                UPDATE "InventoryCount"
                SET "status" = 'POSTED', "postedBy" = $1, "postedAt" = NOW(), "updatedAt" = NOW()
                WHERE id = $2
            `, [userId, inventoryCountId]);

            // Log Audit event
            await AuditService.log(client, {
                userId,
                userName: userDetails?.name || userDetails?.username,
                userRole: userDetails?.role,
                action: 'POST',
                entity: 'GoodsReceipt', // Categorized under Stock Inventory
                entityId: inventoryCountId,
                newData: { status: 'POSTED', docNumber: doc.number }
            });

            await client.query('COMMIT');
            return { success: true, message: 'Інвентаризацію успішно проведено' };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}
