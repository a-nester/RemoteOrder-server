import pool from '../db.js';

export class InventoryService {
    /**
     * Add new stock batch
     */
    static async addStock(client: any, productId: string, quantity: number, enterPrice: number) {
        const result = await client.query(
            `INSERT INTO "ProductBatch" ("productId", "quantityTotal", "quantityLeft", "enterPrice", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
            [productId, quantity, quantity, enterPrice]
        );
        return result.rows[0];
    }

    /**
     * Deduct stock using FIFO logic
     * Returns list of batch deductions to record in OrderItemBatch
     */
    static async deductStock(client: any, productId: string, quantityNeeded: number) {
        // 1. Get available batches ordered by createdAt ASC
        const batchesResult = await client.query(
            `SELECT * FROM "ProductBatch" 
       WHERE "productId" = $1 AND "quantityLeft" > 0 
       ORDER BY "createdAt" ASC 
       FOR UPDATE`, // Lock rows to prevent race conditions
            [productId]
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
            throw new Error(`Insufficient stock for product ${productId}. Needed ${quantityNeeded}, missing ${remaining}`);
        }

        return deductions;
    }
}
