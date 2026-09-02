import pool from '../db.js';
import { InventoryService } from './inventoryService.js';
import { AuditService } from './auditService.js';

const round3 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;

export class StockTransferService {
    /**
     * Get stock balances for selected sender warehouse to populate transfer items
     */
    static async getStockForWarehouse(warehouseId: string) {
        const query = `
            SELECT 
                p.id as "productId",
                p.name as "productName",
                p.code as "productCode",
                p.unit,
                COALESCE(p."enterPrice", 0) as "price",
                COALESCE(SUM(pb."quantityLeft"), 0) as "availableQty"
            FROM "Product" p
            JOIN "ProductBatch" pb ON pb."productId" = p.id AND pb."quantityLeft" > 0
            LEFT JOIN "GoodsReceipt" gr ON pb."goodsReceiptId" = gr.id
            LEFT JOIN "BuyerReturn" br ON pb."buyerReturnId" = br.id
            LEFT JOIN "StockTransfer" st ON pb."stockTransferId" = st.id
            WHERE COALESCE(gr."warehouseId", br."warehouseId", st."toWarehouseId") = $1
              AND p."isDeleted" = FALSE
            GROUP BY p.id, p.name, p.code, p.unit, p."enterPrice"
            ORDER BY p.name ASC
        `;
        const res = await pool.query(query, [warehouseId]);
        return res.rows.map(r => ({
            ...r,
            availableQty: round3(Number(r.availableQty)),
            price: Number(r.price)
        }));
    }

    /**
     * Post stock transfer document
     * 1. Deducts stock from fromWarehouseId via FIFO
     * 2. Creates new ProductBatch rows for toWarehouseId preserving cost structure
     */
    static async post(stockTransferId: string, userId: string, userDetails?: any) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const docRes = await client.query(
                'SELECT * FROM "StockTransfer" WHERE id = $1 FOR UPDATE', 
                [stockTransferId]
            );
            if (docRes.rows.length === 0) throw new Error('Документ переміщення не знайдено');
            
            const doc = docRes.rows[0];
            if (doc.status === 'POSTED') throw new Error('Документ вже проведено');
            if (doc.fromWarehouseId === doc.toWarehouseId) {
                throw new Error('Склад-відправник та Склад-отримувач мають бути різними');
            }

            const itemsRes = await client.query(
                'SELECT * FROM "StockTransferItem" WHERE "stockTransferId" = $1 ORDER BY "sortOrder" ASC', 
                [stockTransferId]
            );
            const items = itemsRes.rows;

            for (const item of items) {
                const qtyToTransfer = round3(Number(item.quantity));
                if (qtyToTransfer <= 0) continue;

                // 1. Deduct stock from fromWarehouseId via FIFO
                const deductions = await InventoryService.deductStock(
                    client, 
                    item.productId, 
                    qtyToTransfer, 
                    doc.fromWarehouseId
                );

                // 2. Create new ProductBatch rows for toWarehouseId using actual enterPrices from deductions
                for (const d of deductions) {
                    await InventoryService.addStock(
                        client,
                        item.productId,
                        d.quantity,
                        d.enterPrice,
                        undefined,
                        new Date(),
                        undefined,
                        stockTransferId
                    );
                }
            }

            // Update status to POSTED
            await client.query(`
                UPDATE "StockTransfer"
                SET "status" = 'POSTED', "postedBy" = $1, "postedAt" = NOW(), "updatedAt" = NOW()
                WHERE id = $2
            `, [userId, stockTransferId]);

            // Log Audit event
            await AuditService.log(client, {
                userId,
                userName: userDetails?.name || userDetails?.username,
                userRole: userDetails?.role,
                action: 'POST',
                entity: 'GoodsReceipt', // Categorized under Stock Inventory
                entityId: stockTransferId,
                newData: { status: 'POSTED', docNumber: doc.number }
            });

            await client.query('COMMIT');
            return { success: true, message: 'Переміщення товарів успішно проведено' };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}
