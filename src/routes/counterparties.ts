
import { Router, Request, Response } from 'express';
import pool from '../db.js';
import { adminAuth } from '../middleware/auth.js';

const router = Router();

router.use(adminAuth);

// --- GROUPS ---

// GET /counterparty-groups
router.get('/counterparty-groups', async (req: Request, res: Response) => {
    try {
        const result = await pool.query('SELECT * FROM "CounterpartyGroup" WHERE "isDeleted" = false ORDER BY "name" ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Get groups error:', error);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

// POST /counterparty-groups
router.post('/counterparty-groups', async (req: Request, res: Response) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        const result = await pool.query(
            'INSERT INTO "CounterpartyGroup" ("name") VALUES ($1) RETURNING *',
            [name]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create group error:', error);
        res.status(500).json({ error: 'Failed to create group' });
    }
});

// --- COUNTERPARTIES ---

// GET /counterparties
router.get('/counterparties', async (req: Request, res: Response) => {
    try {
        const result = await pool.query(`
            SELECT c.*, g."name" as "groupName", pt."name" as "priceTypeName"
            FROM "Counterparty" c
            LEFT JOIN "CounterpartyGroup" g ON c."groupId" = g."id"
            LEFT JOIN "PriceType" pt ON c."priceTypeId" = pt."id"
            WHERE c."isDeleted" = false
            ORDER BY c."name" ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Get counterparties error:', error);
        res.status(500).json({ error: 'Failed to fetch counterparties' });
    }
});

// POST /counterparties
router.post('/counterparties', async (req: Request, res: Response) => {
    try {
        const { name, address, phone, contactPerson, isBuyer, isSeller, priceTypeId, groupId } = req.body;

        if (!name) return res.status(400).json({ error: 'Name is required' });

        const result = await pool.query(
            `INSERT INTO "Counterparty" 
            ("name", "address", "phone", "contactPerson", "isBuyer", "isSeller", "priceTypeId", "groupId") 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING *`,
            [name, address, phone, contactPerson, isBuyer || false, isSeller || false, priceTypeId, groupId]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create counterparty error:', error);
        res.status(500).json({ error: 'Failed to create counterparty' });
    }
});

// PUT /counterparties/:id
router.put('/counterparties/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, address, phone, contactPerson, isBuyer, isSeller, priceTypeId, groupId } = req.body;

        const result = await pool.query(
            `UPDATE "Counterparty" 
            SET "name" = COALESCE($2, "name"), 
                "address" = COALESCE($3, "address"), 
                "phone" = COALESCE($4, "phone"), 
                "contactPerson" = COALESCE($5, "contactPerson"), 
                "isBuyer" = COALESCE($6, "isBuyer"), 
                "isSeller" = COALESCE($7, "isSeller"), 
                "priceTypeId" = $8, -- Allow null
                "groupId" = $9,     -- Allow null
                "updatedAt" = NOW()
            WHERE "id" = $1 
            RETURNING *`,
            [id, name, address, phone, contactPerson, isBuyer, isSeller, priceTypeId, groupId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Counterparty not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Update counterparty error:', error);
        res.status(500).json({ error: 'Failed to update counterparty' });
    }
});

// DELETE /counterparties/:id
router.delete('/counterparties/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await pool.query('UPDATE "Counterparty" SET "isDeleted" = true WHERE "id" = $1', [id]);
        res.json({ success: true, message: 'Counterparty deleted' });
    } catch (error) {
        console.error('Delete counterparty error:', error);
        res.status(500).json({ error: 'Failed to delete counterparty' });
    }
});

export default router;
