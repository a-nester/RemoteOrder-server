import pool from '../db.js';

export class PriceDocumentService {
    static async apply(id: string, txClient?: any) {
        const client = txClient || await pool.connect();
        try {
            if (!txClient) await client.query('BEGIN');

            const docResult = await client.query(`
                SELECT pd.*, pt.slug as "targetPriceSlug"
                FROM "PriceDocument" pd
                JOIN "PriceType" pt ON pd."targetPriceTypeId" = pt.id
                WHERE pd.id = $1
            `, [id]);

            if (docResult.rows.length === 0) throw new Error('Document not found');
            const doc = docResult.rows[0];

            const targetSlug = doc.targetPriceSlug;

            const itemsResult = await client.query('SELECT * FROM "PriceDocumentItem" WHERE "documentId" = $1', [id]);
            const items = itemsResult.rows;

            for (const item of items) {
                const { productId, price } = item;

                const productRes = await client.query('SELECT prices FROM "Product" WHERE id = $1', [productId]);
                if (productRes.rows.length === 0) continue; 

                const currentPrices = productRes.rows[0].prices || {};
                const oldPrice = Number(currentPrices[targetSlug] || 0);

                await client.query(`
                    INSERT INTO "PriceJournal" (
                        "productId", "priceTypeId", "oldPrice", "newPrice", 
                        "effectiveDate", "createdBy", "reason", "createdAt"
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `, [
                    productId,
                    doc.targetPriceTypeId,
                    oldPrice,
                    price,
                    doc.date,
                    null,
                    `Price Document Applied`,
                    doc.date
                ]);

                currentPrices[targetSlug] = price;
                await client.query(`
                    UPDATE "Product"
                    SET "prices" = $1, "updatedAt" = NOW()
                    WHERE id = $2
                `, [JSON.stringify(currentPrices), productId]);
            }

            await client.query(`
                UPDATE "PriceDocument"
                SET "status" = 'APPLIED', "updatedAt" = NOW()
                WHERE id = $1
            `, [id]);

            if (!txClient) await client.query('COMMIT');
            return { success: true };
        } catch (error) {
            if (!txClient) await client.query('ROLLBACK');
            throw error;
        } finally {
            if (!txClient) client.release();
        }
    }
}
