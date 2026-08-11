import { Router, Request, Response } from 'express';
import pool from '../db.js';
import { adminAuth } from '../middleware/auth.js';
import { getUserAllowedPriceTypes } from '../utils/userUtils.js';

const router = Router();

router.use(adminAuth);

// 📋 List all price types
router.get('/price-types', async (req: Request, res: Response) => {
    try {
        const allowedPriceTypes = getUserAllowedPriceTypes((req as any).user);
        let query = 'SELECT * FROM "PriceType" WHERE "deleted" = false';
        const params: any[] = [];

        if (allowedPriceTypes && allowedPriceTypes.length > 0) {
            query += ' AND "id"::text = ANY($1::text[])';
            params.push(allowedPriceTypes);
        }

        query += ' ORDER BY "createdAt" ASC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get price types error:', error);
        res.status(500).json({ error: 'Failed to get price types' });
    }
});

// ➕ Create new price type
router.post('/price-types', async (req: Request, res: Response) => {
    try {
        const { name, slug, currency } = req.body;

        if (!name || !slug) {
            return res.status(400).json({ error: 'Name and slug are required' });
        }

        const result = await pool.query(
            `INSERT INTO "PriceType" ("name", "slug", "currency") VALUES ($1, $2, $3) RETURNING *`,
            [name, slug, currency || 'UAH']
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create price type error:', error);
        if ((error as any).code === '23505') {
            return res.status(409).json({ error: 'Slug already exists' });
        }
        res.status(500).json({ error: 'Failed to create price type' });
    }
});

// ✏️ Update price type
router.put('/price-types/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, slug, currency } = req.body;

        const result = await pool.query(
            `UPDATE "PriceType" 
             SET "name" = COALESCE($1, "name"), 
                 "slug" = COALESCE($2, "slug"), 
                 "currency" = COALESCE($3, "currency"),
                 "updatedAt" = NOW() 
             WHERE "id" = $4 AND "deleted" = false 
             RETURNING *`,
            [name, slug, currency, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Price type not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Update price type error:', error);
        res.status(500).json({ error: 'Failed to update price type' });
    }
});

// ❌ Delete price type (soft delete)
router.delete('/price-types/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Check if price type is in use
        const countRes = await pool.query('SELECT COUNT(*) FROM "Counterparty" WHERE "priceTypeId" = $1 AND "isDeleted" = false', [id]);
        if (parseInt(countRes.rows[0].count, 10) > 0) {
            return res.status(400).json({ error: 'Price type is in use by active counterparties and cannot be deleted' });
        }

        await pool.query('UPDATE "PriceType" SET "deleted" = true, "updatedAt" = NOW() WHERE "id" = $1', [id]);
        res.json({ message: 'Price type deleted successfully' });
    } catch (error) {
        console.error('Delete price type error:', error);
        res.status(500).json({ error: 'Failed to delete price type' });
    }
});

export default router;
