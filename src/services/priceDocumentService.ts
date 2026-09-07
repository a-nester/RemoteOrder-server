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
                WHERE pd.id = $1 FOR UPDATE OF pd
            `, [id]);

            if (docResult.rows.length === 0) throw new Error('Document not found');
            const doc = docResult.rows[0];

            if (doc.status === 'APPLIED') {
                throw new Error('Price document is already applied');
            }

            const targetSlug = doc.targetPriceSlug;

            // 1. Insert entries into PriceJournal for all items in this document
            await client.query(`
                INSERT INTO "PriceJournal" (
                    "productId", "priceTypeId", "oldPrice", "newPrice", 
                    "effectiveDate", "createdBy", "reason", "createdAt"
                )
                SELECT 
                    pdi."productId",
                    pd."targetPriceTypeId",
                    COALESCE((p.prices->>$2)::numeric, 0),
                    pdi.price,
                    pd.date,
                    null,
                    'Price Document Applied: ' || pd.id,
                    pd.date
                FROM "PriceDocumentItem" pdi
                JOIN "PriceDocument" pd ON pd.id = pdi."documentId"
                LEFT JOIN "Product" p ON p.id = pdi."productId"
                WHERE pdi."documentId" = $1
            `, [id, targetSlug]);

            // 2. Bulk update Product prices for target slug
            await client.query(`
                UPDATE "Product" p
                SET "prices" = jsonb_set(
                    COALESCE(p."prices"::jsonb, '{}'::jsonb),
                    ARRAY[$1],
                    to_jsonb(pdi.price)
                ),
                "updatedAt" = NOW()
                FROM "PriceDocumentItem" pdi
                WHERE p.id = pdi."productId" AND pdi."documentId" = $2
            `, [targetSlug, id]);

            // 3. Mark document status as APPLIED
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

    static async unpost(id: string, txClient?: any) {
        const client = txClient || await pool.connect();
        try {
            if (!txClient) await client.query('BEGIN');

            const docResult = await client.query(`
                SELECT pd.*, pt.slug as "targetPriceSlug"
                FROM "PriceDocument" pd
                JOIN "PriceType" pt ON pd."targetPriceTypeId" = pt.id
                WHERE pd.id = $1 FOR UPDATE OF pd
            `, [id]);

            if (docResult.rows.length === 0) throw new Error('Document not found');
            const doc = docResult.rows[0];

            if (doc.status !== 'APPLIED') {
                throw new Error('Only APPLIED price documents can be unposted');
            }

            const targetSlug = doc.targetPriceSlug;

            // 1. Bulk delete associated PriceJournal entries for this document
            await client.query(`
                DELETE FROM "PriceJournal"
                WHERE "priceTypeId" = $1 
                  AND (
                    "reason" = $2 
                    OR ("reason" = 'Price Document Applied' AND "effectiveDate" = $3)
                  )
                  AND "productId" IN (
                    SELECT "productId" FROM "PriceDocumentItem" WHERE "documentId" = $4
                  )
            `, [doc.targetPriceTypeId, `Price Document Applied: ${id}`, doc.date, id]);

            // 2. Bulk update products with remaining prices from PriceJournal
            await client.query(`
                UPDATE "Product" p
                SET "prices" = jsonb_set(
                    COALESCE(p."prices"::jsonb, '{}'::jsonb),
                    ARRAY[$1],
                    to_jsonb(COALESCE(lp."newPrice", 0))
                ),
                "updatedAt" = NOW()
                FROM (
                    SELECT DISTINCT ON ("productId") "productId", "newPrice"
                    FROM "PriceJournal"
                    WHERE "priceTypeId" = $2 AND "productId" IN (
                        SELECT "productId" FROM "PriceDocumentItem" WHERE "documentId" = $3
                    )
                    ORDER BY "productId", "effectiveDate" DESC, "createdAt" DESC
                ) lp
                WHERE p.id = lp."productId"
            `, [targetSlug, doc.targetPriceTypeId, id]);

            // 3. Bulk reset products that have no remaining journal entries to 0 for target slug
            await client.query(`
                UPDATE "Product" p
                SET "prices" = jsonb_set(
                    COALESCE(p."prices"::jsonb, '{}'::jsonb),
                    ARRAY[$1],
                    '0'::jsonb
                ),
                "updatedAt" = NOW()
                WHERE p.id IN (
                    SELECT "productId" FROM "PriceDocumentItem" WHERE "documentId" = $2
                )
                AND p.id NOT IN (
                    SELECT "productId" FROM "PriceJournal" WHERE "priceTypeId" = $3
                )
            `, [targetSlug, id, doc.targetPriceTypeId]);

            // 4. Update status of PriceDocument back to DRAFT
            await client.query(`
                UPDATE "PriceDocument"
                SET "status" = 'DRAFT', "updatedAt" = NOW()
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
