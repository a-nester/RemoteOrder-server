import { Router, Response } from 'express';
import pool from '../db.js';
import { adminAuth, AuthRequest } from '../middleware/auth.js';
import { getUserAllowedTerritories } from '../utils/userUtils.js';

const router = Router();

router.use(adminAuth);

// --- GROUPS ---

// GET /counterparty-groups
router.get('/counterparty-groups', async (req: AuthRequest, res: Response) => {
    try {
        const result = await pool.query('SELECT * FROM "CounterpartyGroup" WHERE "isDeleted" = false ORDER BY "name" ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Get groups error:', error);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

// POST /counterparty-groups
router.post('/counterparty-groups', async (req: AuthRequest, res: Response) => {
    try {
        const { name, parentId } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });

        const query = parentId 
            ? 'INSERT INTO "CounterpartyGroup" ("name", "parentId") VALUES ($1, $2) RETURNING *'
            : 'INSERT INTO "CounterpartyGroup" ("name") VALUES ($1) RETURNING *';
        const params = parentId ? [name, parentId] : [name];

        const result = await pool.query(query, params);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create group error:', error);
        res.status(500).json({ error: 'Failed to create group' });
    }
});

// --- COUNTERPARTIES ---

// GET /counterparties
router.get('/counterparties', async (req: AuthRequest, res: Response) => {
    try {
        const allowedTerritories = getUserAllowedTerritories(req.user);
        let query = `
            SELECT c.*, g."name" as "groupName", pt."name" as "priceTypeName", o."name" as "organizationName", t."name" as "territoryName"
            FROM "Counterparty" c
            LEFT JOIN "CounterpartyGroup" g ON c."groupId" = g."id"
            LEFT JOIN "PriceType" pt ON c."priceTypeId" = pt."id"
            LEFT JOIN "Organization" o ON c."organizationId" = o."id"
            LEFT JOIN "Territory" t ON c."territoryId" = t."id"
            WHERE c."isDeleted" = false
        `;
        const params: any[] = [];

        if (allowedTerritories && allowedTerritories.length > 0) {
            query += ` AND c."territoryId"::text = ANY($${params.length + 1}::text[])`;
            params.push(allowedTerritories);
        }

        query += ` ORDER BY c."name" ASC`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get counterparties error:', error);
        res.status(500).json({ error: 'Failed to fetch counterparties' });
    }
});

// POST /counterparties
router.post('/counterparties', async (req: AuthRequest, res: Response) => {
    try {
        const { name, address, phone, contactPerson, isBuyer, isSeller, priceTypeId, groupId, warehouseId, defaultSalesType, organizationId, territoryId } = req.body;

        if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

        // Protection against duplicate counterparty names (case-insensitive & trimmed)
        const duplicateCheck = await pool.query(
            `SELECT id FROM "Counterparty" 
             WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND "isDeleted" = false
             LIMIT 1`,
            [name.trim()]
        );

        if (duplicateCheck.rows.length > 0) {
            return res.status(409).json({ 
                error: `Контрагент з назвою "${name.trim()}" вже існує у системі.` 
            });
        }

        const result = await pool.query(
            `INSERT INTO "Counterparty" 
            ("name", "address", "phone", "contactPerson", "isBuyer", "isSeller", "priceTypeId", "groupId", "warehouseId", "defaultSalesType", "organizationId", "territoryId") 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
            RETURNING *`,
            [name.trim(), address, phone, contactPerson, isBuyer || false, isSeller || false, priceTypeId || null, groupId || null, warehouseId || null, defaultSalesType || 'Готівковий', organizationId || null, territoryId || null]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create counterparty error:', error);
        res.status(500).json({ error: 'Failed to create counterparty' });
    }
});

// PUT /counterparties/:id
router.put('/counterparties/:id', async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { name, address, phone, contactPerson, isBuyer, isSeller, priceTypeId, groupId, warehouseId, defaultSalesType, organizationId, territoryId } = req.body;

        if (name && name.trim()) {
            const duplicateCheck = await pool.query(
                `SELECT id FROM "Counterparty" 
                 WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND id != $2 AND "isDeleted" = false
                 LIMIT 1`,
                [name.trim(), id]
            );

            if (duplicateCheck.rows.length > 0) {
                return res.status(409).json({ 
                    error: `Контрагент з назвою "${name.trim()}" вже існує у системі.` 
                });
            }
        }

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
                "warehouseId" = $10, -- Allow null
                "defaultSalesType" = COALESCE($11, "defaultSalesType"),
                "organizationId" = $12, -- Allow null
                "territoryId" = $13,    -- Allow null
                "updatedAt" = NOW()
            WHERE "id" = $1 
            RETURNING *`,
            [id, name, address, phone, contactPerson, isBuyer, isSeller, priceTypeId || null, groupId || null, warehouseId || null, defaultSalesType, organizationId || null, territoryId || null]
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
router.delete('/counterparties/:id', async (req: AuthRequest, res: Response) => {
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
