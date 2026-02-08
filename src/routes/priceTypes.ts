import { Router, Request, Response } from 'express';
import pool from '../db.js';
import { adminAuth } from '../middleware/auth.js';

const router = Router();

router.use(adminAuth);

// 📋 List all price types
router.get('/price-types', async (req: Request, res: Response) => {
    try {
        const result = await pool.query('SELECT * FROM "PriceType" WHERE "deleted" = false ORDER BY "createdAt" ASC');
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
       SET "name" = COALESCE($2, "name"), 
           "slug" = COALESCE($3, "slug"), 
           "currency" = COALESCE($4, "currency"),
           "updatedAt" = NOW()
       WHERE "id" = $1 RETURNING *`,
            [id, name, slug, currency]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Price type not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Update price type error:', error);
        if ((error as any).code === '23505') {
            return res.status(409).json({ error: 'Slug already exists' });
        }
        res.status(500).json({ error: 'Failed to update price type' });
    }
});

// ❌ Delete price type
router.delete('/price-types/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        // Check if it's 'standard' - maybe prevent deletion?
        // For now allow all, but frontend should handle key mismatch.

        await pool.query('UPDATE "PriceType" SET "deleted" = true, "updatedAt" = NOW() WHERE "id" = $1', [id]);
        res.json({ success: true, message: 'Price type deleted' });
    } catch (error) {
        console.error('Delete price type error:', error);
        res.status(500).json({ error: 'Failed to delete price type' });
    }
});

export default router;
