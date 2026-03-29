import pool from '../db.js';

export class InventoryService {
    /**
     * Add new stock batch
     */
    /**
     * Add new stock batch
     */
    static async addStock(client: any, productId: string, quantity: number, enterPrice: number, goodsReceiptId?: string, targetDate?: Date, buyerReturnId?: string) {
        const result = await client.query(
            `INSERT INTO "ProductBatch" ("productId", "quantityTotal", "quantityLeft", "enterPrice", "goodsReceiptId", "buyerReturnId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
            [productId, quantity, quantity, enterPrice, goodsReceiptId || null, buyerReturnId || null, targetDate || new Date()]
        );
        return result.rows[0];
    }

    /**
     * Deduct stock using FIFO logic, restricted by warehouse
     * Returns list of batch deductions to record in OrderItemBatch
     */
    static async deductStock(client: any, productId: string, quantityNeeded: number, warehouseId: string) {
        // 1. Get available batches ordered by createdAt ASC, filtered by warehouse
        const batchesResult = await client.query(
            `SELECT pb.* FROM "ProductBatch" pb
             LEFT JOIN "GoodsReceipt" gr ON pb."goodsReceiptId" = gr.id
             LEFT JOIN "BuyerReturn" br ON pb."buyerReturnId" = br.id
             WHERE pb."productId" = $1 
               AND pb."quantityLeft" > 0 
               AND COALESCE(gr."warehouseId", br."warehouseId") = $2
             ORDER BY pb."createdAt" ASC 
             FOR UPDATE OF pb`, // Lock only ProductBatch rows
            [productId, warehouseId]
        );

        const batches = batchesResult.rows;
        let remaining = quantityNeeded;
        const deductions: { batchId: string, quantity: number, enterPrice: number }[] = [];

        for (const batch of batches) {
            if (remaining <= 0) break;

            const take = Math.min(remaining, batch.quantityLeft);

            // Update batch
            await client.query(
                `UPDATE "ProductBatch" 
         SET "quantityLeft" = "quantityLeft" - $1, "updatedAt" = NOW() 
         WHERE "id" = $2`,
                [take, batch.id]
            );

            deductions.push({
                batchId: batch.id,
                quantity: take,
                enterPrice: Number(batch.enterPrice)
            });

            remaining -= take;
        }

        if (remaining > 0) {
            const prodRes = await client.query('SELECT name FROM "Product" WHERE id = $1', [productId]);
            const productName = prodRes.rows[0]?.name || productId;
            throw new Error(JSON.stringify({
                code: 'INSUFFICIENT_STOCK',
                productName,
                needed: quantityNeeded,
                missing: remaining
            }));
        }

        return deductions;
    }

     /**
     * Повернення товару на склад по конкретних batch-записах
     */
    static async returnStock(client: any, realizationId: string) {

    // 1. Отримати всі batch записи
    const batchesRes = await client.query(`
        SELECT rib.*, ri."productId"
        FROM "RealizationItemBatch" rib
        JOIN "RealizationItem" ri 
            ON rib."realizationItemId" = ri.id
        WHERE ri."realizationId" = $1
    `, [realizationId]);

    const batches = batchesRes.rows;

    // 2. Повернути кількість у відповідні партії
    for (const batch of batches) {
        await client.query(`
            UPDATE "ProductBatch"
            SET "quantityLeft" = "quantityLeft" + $1,
                "updatedAt" = NOW()
            WHERE id = $2
        `, [batch.quantity, batch.productBatchId]);
    }

    return batches;
}
}
