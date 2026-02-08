import pool from '../db.js';

export interface PriceSetParams {
    productId: string;
    newPrice: number;
    priceTypeId?: string;
    userId?: string; // ID of the admin/user setting the price
    reason?: string;
    effectiveDate?: Date;
}

export class PriceService {
    /**
     * Sets a new price for a product and logs existing price to history.
     */
    static async setPrice(client: any, params: PriceSetParams) {
        const { productId, newPrice, priceTypeId, userId, reason, effectiveDate } = params;

        let targetSlug = 'standard';

        // 1. Determine target price slug
        if (priceTypeId) {
            const typeResult = await client.query('SELECT slug FROM "PriceType" WHERE id = $1', [priceTypeId]);
            if (typeResult.rows.length === 0) {
                throw new Error(`PriceType ${priceTypeId} not found`);
            }
            targetSlug = typeResult.rows[0].slug;
        }

        // 2. Get current product and prices
        const productResult = await client.query('SELECT * FROM "Product" WHERE "id" = $1', [productId]);
        if (productResult.rows.length === 0) {
            throw new Error(`Product ${productId} not found`);
        }

        const product = productResult.rows[0];
        const prices = product.prices || {};
        const oldPrice = Number(prices[targetSlug] || 0);

        // 3. Insert into PriceJournal
        await client.query(`
            INSERT INTO "PriceJournal" (
                "productId", "priceTypeId", "oldPrice", "newPrice", 
                "effectiveDate", "createdBy", "reason", "createdAt"
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `, [
            productId,
            priceTypeId || null,
            oldPrice,
            newPrice,
            effectiveDate || new Date(),
            userId || null,
            reason || null
        ]);

        // 4. Update the actual Product price 
        // Only if effectiveDate is NOW or in the past
        const isEffectiveNow = !effectiveDate || new Date(effectiveDate) <= new Date();

        if (isEffectiveNow) {
            // Update the specific price slug
            prices[targetSlug] = newPrice;

            await client.query(`
                UPDATE "Product" 
                SET "prices" = $1, "updatedAt" = NOW()
                WHERE "id" = $2
            `, [JSON.stringify(prices), productId]);
        }

        return { success: true, oldPrice, newPrice };
    }

    /**
     * Get price history for a product
     */
    static async getHistory(productId: string) {
        const result = await pool.query(`
            SELECT * FROM "PriceJournal" 
            WHERE "productId" = $1 
            ORDER BY "effectiveDate" DESC, "createdAt" DESC
        `, [productId]);
        return result.rows;
    }
}
