import { Request, Response } from 'express';
import pool from '../db.js';

export const createDocument = async (req: Request, res: Response): Promise<any> => {
    const { date, comment, targetPriceTypeId, inputMethod, sourcePriceTypeId, markupPercentage, roundingMethod } = req.body;

    try {
        const result = await pool.query(`
            INSERT INTO "PriceDocument" (
                "date", "comment", "targetPriceTypeId", "inputMethod", 
                "sourcePriceTypeId", "markupPercentage", "roundingMethod", "roundingValue", "status", "createdAt"
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'DRAFT', NOW())
            RETURNING *
        `, [date || new Date(), comment, targetPriceTypeId, inputMethod, sourcePriceTypeId, markupPercentage, roundingMethod || 'NONE', req.body.roundingValue]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating price document:', error);
        res.status(500).json({ error: 'Failed to create price document' });
    }
};

export const getDocuments = async (req: Request, res: Response): Promise<any> => {
    try {
        const result = await pool.query(`
            SELECT pd.*, pt.name as "targetPriceTypeName"
            FROM "PriceDocument" pd
            LEFT JOIN "PriceType" pt ON pd."targetPriceTypeId" = pt.id
            ORDER BY pd."date" DESC, pd."createdAt" DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching price documents:', error);
        res.status(500).json({ error: 'Failed to fetch price documents' });
    }
};

export const getDocument = async (req: Request, res: Response): Promise<any> => {
    const { id } = req.params;
    try {
        const docResult = await pool.query(`
            SELECT pd.*, pt.name as "targetPriceTypeName", spt.name as "sourcePriceTypeName"
            FROM "PriceDocument" pd
            LEFT JOIN "PriceType" pt ON pd."targetPriceTypeId" = pt.id
            LEFT JOIN "PriceType" spt ON pd."sourcePriceTypeId" = spt.id
            WHERE pd.id = $1
        `, [id]);

        if (docResult.rows.length === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const itemsResult = await pool.query(`
            SELECT pdi.*, p.name as "productName", p.unit
            FROM "PriceDocumentItem" pdi
            JOIN "Product" p ON pdi."productId" = p.id
            WHERE pdi."documentId" = $1
            ORDER BY p.name ASC
        `, [id]);

        res.json({ ...docResult.rows[0], items: itemsResult.rows });
    } catch (error) {
        console.error('Error fetching price document:', error);
        res.status(500).json({ error: 'Failed to fetch price document' });
    }
};

export const updateDocument = async (req: Request, res: Response): Promise<any> => {
    const { id } = req.params;
    const { date, comment, targetPriceTypeId, inputMethod, sourcePriceTypeId, markupPercentage, roundingMethod } = req.body;

    try {
        // Check if draft
        const docCheck = await pool.query('SELECT status FROM "PriceDocument" WHERE id = $1', [id]);
        if (docCheck.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
        // if (docCheck.rows[0].status !== 'DRAFT') return res.status(400).json({ error: 'Cannot update non-draft document' });

        const result = await pool.query(`
            UPDATE "PriceDocument"
            SET "date" = COALESCE($1, "date"),
                "comment" = COALESCE($2, "comment"),
                "targetPriceTypeId" = COALESCE($3, "targetPriceTypeId"),
                "inputMethod" = COALESCE($4, "inputMethod"),
                "sourcePriceTypeId" = $5, -- Can be null
                "markupPercentage" = $6, -- Can be null
                "roundingMethod" = COALESCE($7, "roundingMethod"),
                "roundingValue" = $8, -- Can be null
                "updatedAt" = NOW()
            WHERE id = $9
            RETURNING *
        `, [date, comment, targetPriceTypeId, inputMethod, sourcePriceTypeId, markupPercentage, roundingMethod, req.body.roundingValue, id]);

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating price document:', error);
        res.status(500).json({ error: 'Failed to update price document' });
    }
};

export const updateDocumentItems = async (req: Request, res: Response): Promise<any> => {
    const { id } = req.params;
    const { items } = req.body; // Array of { productId, price }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if draft
        const docCheck = await client.query('SELECT status FROM "PriceDocument" WHERE id = $1', [id]);
        if (docCheck.rows.length === 0) throw new Error('Document not found');
        // if (docCheck.rows[0].status !== 'DRAFT') throw new Error('Cannot update items of non-draft document');

        // Clear existing items (lazy approach, optimized for simplicity)
        // Or upsert. Let's do delete all and insert for now as it handles removals too if the frontend sends the full list.
        // BUT, if frontend sends partial updates, this is bad.
        // Let's assume frontend sends the FULL list of items for the document.
        await client.query('DELETE FROM "PriceDocumentItem" WHERE "documentId" = $1', [id]);

        for (const item of items) {
            await client.query(`
                INSERT INTO "PriceDocumentItem" ("documentId", "productId", "price")
                VALUES ($1, $2, $3)
            `, [id, item.productId, item.price]);
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating document items:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update items' });
    } finally {
        client.release();
    }
};

export const applyDocument = async (req: Request, res: Response): Promise<any> => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Get Document
        const docResult = await client.query(`
            SELECT pd.*, pt.slug as "targetPriceSlug"
            FROM "PriceDocument" pd
            JOIN "PriceType" pt ON pd."targetPriceTypeId" = pt.id
            WHERE pd.id = $1
        `, [id]);

        if (docResult.rows.length === 0) throw new Error('Document not found');
        const doc = docResult.rows[0];

        // if (doc.status !== 'DRAFT') throw new Error('Document already applied');

        const targetSlug = doc.targetPriceSlug;

        // 2. Get Items
        const itemsResult = await client.query('SELECT * FROM "PriceDocumentItem" WHERE "documentId" = $1', [id]);
        const items = itemsResult.rows;

        // 3. Loop items and update prices
        for (const item of items) {
            const { productId, price } = item;

            // Get current product state for logging old price
            const productRes = await client.query('SELECT prices FROM "Product" WHERE id = $1', [productId]);
            if (productRes.rows.length === 0) continue; // Skip if product deleted?

            const currentPrices = productRes.rows[0].prices || {};
            const oldPrice = Number(currentPrices[targetSlug] || 0);

            // Log to PriceJournal (Manual SQL to avoid circular dependency or import issues, or can try to use PriceService if adjusted)
            // Let's use direct SQL for atomicity within this transaction
            await client.query(`
                INSERT INTO "PriceJournal" (
                    "productId", "priceTypeId", "oldPrice", "newPrice", 
                    "effectiveDate", "createdBy", "reason", "createdAt"
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            `, [
                productId,
                doc.targetPriceTypeId,
                oldPrice,
                price,
                doc.date, // Effective date is document date
                null, // User ID not passed currently, maybe from req.user?
                `Price Document Applied`
            ]);

            // Update Product
            currentPrices[targetSlug] = price;
            await client.query(`
                UPDATE "Product"
                SET "prices" = $1, "updatedAt" = NOW()
                WHERE id = $2
            `, [JSON.stringify(currentPrices), productId]);
        }

        // 4. Update Document Status
        await client.query('UPDATE "PriceDocument" SET status = \'APPLIED\', "updatedAt" = NOW() WHERE id = $1', [id]);

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error applying price document:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to apply document' });
    } finally {
        client.release();
    }
};

export const copyDocument = async (req: Request, res: Response): Promise<any> => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Get Original Document
        const docResult = await client.query('SELECT * FROM "PriceDocument" WHERE id = $1', [id]);
        if (docResult.rows.length === 0) throw new Error('Document not found');
        const originalDoc = docResult.rows[0];

        // 2. Create New Document
        const newDocResult = await client.query(`
            INSERT INTO "PriceDocument" (
                "date", "comment", "targetPriceTypeId", "inputMethod", 
                "sourcePriceTypeId", "markupPercentage", "roundingMethod", "roundingValue", "status", "createdAt"
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'DRAFT', NOW())
            RETURNING *
        `, [
            new Date(), // Current date
            `Copy of (${new Date(originalDoc.date).toLocaleDateString()}) ${originalDoc.comment || ''}`.trim(),
            originalDoc.targetPriceTypeId,
            originalDoc.inputMethod,
            originalDoc.sourcePriceTypeId,
            originalDoc.markupPercentage,
            originalDoc.roundingMethod || 'NONE',
            originalDoc.roundingValue
        ]);
        const newDoc = newDocResult.rows[0];

        // 3. Get Original Items
        const itemsResult = await client.query('SELECT * FROM "PriceDocumentItem" WHERE "documentId" = $1', [id]);
        const originalItems = itemsResult.rows;

        // 4. Insert Copied Items
        for (const item of originalItems) {
            await client.query(`
                INSERT INTO "PriceDocumentItem" ("documentId", "productId", "price")
                VALUES ($1, $2, $3)
            `, [newDoc.id, item.productId, item.price]);
        }

        await client.query('COMMIT');
        res.status(201).json(newDoc);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error copying price document:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to copy document' });
    } finally {
        client.release();
    }
};
