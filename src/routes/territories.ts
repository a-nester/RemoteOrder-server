import { Router, Request, Response } from 'express';
import pool from '../db.js';
import { adminAuth } from '../middleware/auth.js';

const router = Router();

// Require admin or manager auth for territories endpoints
router.use(adminAuth);

// GET /api/territories
router.get('/', async (req: Request, res: Response) => {
    try {
        const result = await pool.query('SELECT * FROM "Territory" ORDER BY "name" ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Get territories error:', error);
        res.status(500).json({ error: 'Failed to fetch territories' });
    }
});

// POST /api/territories
router.post('/', async (req: Request, res: Response) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Name is required' });
        }

        const trimmedName = name.trim();

        // Check if territory with this name already exists
        const existing = await pool.query('SELECT * FROM "Territory" WHERE LOWER("name") = LOWER($1)', [trimmedName]);
        if (existing.rows.length > 0) {
            return res.json(existing.rows[0]);
        }

        const result = await pool.query(
            'INSERT INTO "Territory" ("name") VALUES ($1) RETURNING *',
            [trimmedName]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create territory error:', error);
        res.status(500).json({ error: 'Failed to create territory' });
    }
});

// DELETE /api/territories/:id
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM "Territory" WHERE "id" = $1', [id]);
        res.json({ success: true, message: 'Territory deleted' });
    } catch (error) {
        console.error('Delete territory error:', error);
        res.status(500).json({ error: 'Failed to delete territory' });
    }
});

export default router;
