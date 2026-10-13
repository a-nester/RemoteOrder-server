import express, { Response } from 'express';
import pool from '../db.js';
import { userAuth, AuthRequest } from '../middleware/auth.js';
import { generateDocNumber } from '../utils/docNumberGenerator.js';

const router = express.Router();

// GET list of Route Sheets
router.get('/', userAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { startDate, endDate, status, search } = req.query;
        let query = `
            SELECT rs.*,
                   u.email as "creatorEmail",
                   COUNT(rsi.id)::int as "itemCount",
                   COALESCE(SUM(r.amount), 0)::numeric as "realizationTotalSum"
            FROM "RouteSheet" rs
            LEFT JOIN "User" u ON rs."createdBy" = u.id
            LEFT JOIN "RouteSheetItem" rsi ON rs.id = rsi."routeSheetId"
            LEFT JOIN "Realization" r ON rsi."realizationId" = r.id
            WHERE rs."isDeleted" = FALSE
        `;
        const params: any[] = [];
        let idx = 1;

        if (startDate) {
            query += ` AND rs."date" >= $${idx++}`;
            params.push(startDate);
        }
        if (endDate) {
            query += ` AND rs."date" <= $${idx++}`;
            params.push(endDate);
        }
        if (status && status !== 'ALL') {
            query += ` AND rs."status" = $${idx++}`;
            params.push(status);
        }
        if (search && String(search).trim()) {
            query += ` AND (rs."number" ILIKE $${idx} OR rs."driverName" ILIKE $${idx} OR rs."comment" ILIKE $${idx})`;
            params.push(`%${String(search).trim()}%`);
            idx++;
        }

        query += ` GROUP BY rs.id, u.email ORDER BY rs."date" DESC, rs."createdAt" DESC`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching route sheets:', error);
        res.status(500).json({ message: 'Failed to fetch route sheets' });
    }
});

// GET single Route Sheet with items and nested realization details
router.get('/:id', userAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const docRes = await pool.query(`
            SELECT rs.*, u.email as "creatorEmail"
            FROM "RouteSheet" rs
            LEFT JOIN "User" u ON rs."createdBy" = u.id
            WHERE rs.id = $1 AND rs."isDeleted" = FALSE
        `, [id]);

        if (docRes.rows.length === 0) {
            return res.status(404).json({ message: 'Route sheet not found' });
        }

        // Fetch route sheet items joined with realizations and counterparties
        const itemsRes = await pool.query(`
            SELECT rsi.*,
                   r.number as "realizationNumber",
                   r.date as "realizationDate",
                   r.amount as "realizationAmount",
                   r.currency as "realizationCurrency",
                   r.status as "realizationStatus",
                   r.comment as "realizationComment",
                   r."salesType" as "realizationSalesType",
                   r."warehouseId" as "realizationWarehouseId",
                   c.id as "counterpartyId",
                   c.name as "counterpartyName",
                   c.address as "counterpartyAddress",
                   c.phone as "counterpartyPhone",
                   c."groupId" as "counterpartyGroupId",
                   COALESCE(g.name, 'Без групи') as "counterpartyGroupName"
            FROM "RouteSheetItem" rsi
            JOIN "Realization" r ON rsi."realizationId" = r.id
            JOIN "Counterparty" c ON r."counterpartyId" = c.id
            LEFT JOIN "CounterpartyGroup" g ON c."groupId" = g.id
            WHERE rsi."routeSheetId" = $1
            ORDER BY COALESCE(g.name, 'Без групи') ASC, c.name ASC, rsi."sortOrder" ASC
        `, [id]);

        // If items exist, also fetch the product lines for each realization so print form is complete
        const realizationIds = itemsRes.rows.map(r => r.realizationId);
        let realizationItemsMap: Record<string, any[]> = {};

        if (realizationIds.length > 0) {
            const relItemsRes = await pool.query(`
                SELECT ri.*, p.name as "productName", p.unit
                FROM "RealizationItem" ri
                LEFT JOIN "Product" p ON ri."productId" = p.id::text
                WHERE ri."realizationId" = ANY($1::uuid[])
                ORDER BY ri."sortOrder" ASC NULLS LAST, ri."createdAt" ASC
            `, [realizationIds]);

            relItemsRes.rows.forEach(item => {
                if (!realizationItemsMap[item.realizationId]) {
                    realizationItemsMap[item.realizationId] = [];
                }
                realizationItemsMap[item.realizationId]!.push(item);
            });
        }

        const enrichedItems = itemsRes.rows.map(item => ({
            ...item,
            realizationItems: realizationItemsMap[item.realizationId] || []
        }));

        res.json({
            ...docRes.rows[0],
            items: enrichedItems
        });
    } catch (error) {
        console.error('Error fetching route sheet details:', error);
        res.status(500).json({ message: 'Failed to fetch route sheet' });
    }
});

// POST Create Route Sheet
router.post('/', userAuth, async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { date, driverName, comment, items } = req.body;
        const userId = req.user?.id || null;

        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new Error('Маршрутний лист повинен містити хоча б одну накладну');
        }

        const docDate = date ? new Date(date) : new Date();
        const number = await generateDocNumber('RouteSheet', docDate, 'number');

        // Extract realization IDs to fetch their actual amounts
        const realizationIds = items.map((i: any) => i.realizationId).filter(Boolean);
        const relAmountsRes = await client.query(`
            SELECT id, amount FROM "Realization" WHERE id = ANY($1::uuid[])
        `, [realizationIds]);

        const amountsMap: Record<string, number> = {};
        relAmountsRes.rows.forEach(r => {
            amountsMap[r.id] = Number(r.amount || 0);
        });

        let totalAmount = 0;
        let totalPayment = 0;

        items.forEach((item: any) => {
            const relAmount = amountsMap[item.realizationId] ?? Number(item.amount || 0);
            const clientPayment = Number(item.clientPayment !== undefined && item.clientPayment !== null ? item.clientPayment : relAmount);
            totalAmount += relAmount;
            totalPayment += clientPayment;
        });

        const docRes = await client.query(`
            INSERT INTO "RouteSheet" (
                "number", "date", "status", "driverName", "comment",
                "totalAmount", "totalPayment", "createdBy", "createdAt", "updatedAt"
            ) VALUES ($1, $2, 'SAVED', $3, $4, $5, $6, $7, NOW(), NOW())
            RETURNING *
        `, [number, docDate, driverName || null, comment || null, totalAmount, totalPayment, userId]);

        const newDoc = docRes.rows[0];

        // Insert items
        for (let idx = 0; idx < items.length; idx++) {
            const item = items[idx];
            const relAmount = amountsMap[item.realizationId] ?? Number(item.amount || 0);
            const clientPayment = Number(item.clientPayment !== undefined && item.clientPayment !== null ? item.clientPayment : relAmount);
            await client.query(`
                INSERT INTO "RouteSheetItem" (
                    "routeSheetId", "realizationId", "clientPayment", "comment", "sortOrder"
                ) VALUES ($1, $2, $3, $4, $5)
            `, [newDoc.id, item.realizationId, clientPayment, item.comment || null, idx + 1]);
        }

        await client.query('COMMIT');
        res.status(201).json(newDoc);
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error creating route sheet:', error);
        res.status(400).json({ message: error.message || 'Failed to create route sheet' });
    } finally {
        client.release();
    }
});

// PUT Update Route Sheet
router.put('/:id', userAuth, async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { id } = req.params;
        const { date, driverName, comment, status, items } = req.body;

        // Check if doc exists
        const checkRes = await client.query(`SELECT id FROM "RouteSheet" WHERE id = $1 AND "isDeleted" = FALSE`, [id]);
        if (checkRes.rows.length === 0) {
            throw new Error('Маршрутний лист не знайдено');
        }

        let totalAmount = 0;
        let totalPayment = 0;

        if (items && Array.isArray(items) && items.length > 0) {
            const realizationIds = items.map((i: any) => i.realizationId).filter(Boolean);
            const relAmountsRes = await client.query(`
                SELECT id, amount FROM "Realization" WHERE id = ANY($1::uuid[])
            `, [realizationIds]);

            const amountsMap: Record<string, number> = {};
            relAmountsRes.rows.forEach(r => {
                amountsMap[r.id] = Number(r.amount || 0);
            });

            items.forEach((item: any) => {
                const relAmount = amountsMap[item.realizationId] ?? Number(item.amount || 0);
                const clientPayment = Number(item.clientPayment !== undefined && item.clientPayment !== null ? item.clientPayment : relAmount);
                totalAmount += relAmount;
                totalPayment += clientPayment;
            });

            // Delete old items and insert updated ones
            await client.query(`DELETE FROM "RouteSheetItem" WHERE "routeSheetId" = $1`, [id]);

            for (let idx = 0; idx < items.length; idx++) {
                const item = items[idx];
                const relAmount = amountsMap[item.realizationId] ?? Number(item.amount || 0);
                const clientPayment = Number(item.clientPayment !== undefined && item.clientPayment !== null ? item.clientPayment : relAmount);
                await client.query(`
                    INSERT INTO "RouteSheetItem" (
                        "routeSheetId", "realizationId", "clientPayment", "comment", "sortOrder"
                    ) VALUES ($1, $2, $3, $4, $5)
                `, [id, item.realizationId, clientPayment, item.comment || null, idx + 1]);
            }
        }

        const updateRes = await client.query(`
            UPDATE "RouteSheet"
            SET "date" = COALESCE($1, "date"),
                "driverName" = $2,
                "comment" = $3,
                "status" = COALESCE($4, "status"),
                "totalAmount" = $5,
                "totalPayment" = $6,
                "updatedAt" = NOW()
            WHERE id = $7
            RETURNING *
        `, [
            date ? new Date(date) : null,
            driverName !== undefined ? driverName : null,
            comment !== undefined ? comment : null,
            status || null,
            totalAmount,
            totalPayment,
            id
        ]);

        await client.query('COMMIT');
        res.json(updateRes.rows[0]);
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error updating route sheet:', error);
        res.status(400).json({ message: error.message || 'Failed to update route sheet' });
    } finally {
        client.release();
    }
});

// DELETE Route Sheet (Soft delete)
router.delete('/:id', userAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            UPDATE "RouteSheet" SET "isDeleted" = TRUE, "updatedAt" = NOW()
            WHERE id = $1 AND "isDeleted" = FALSE
            RETURNING id
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Route sheet not found' });
        }

        res.json({ message: 'Маршрутний лист успішно видалено' });
    } catch (error) {
        console.error('Error deleting route sheet:', error);
        res.status(500).json({ message: 'Failed to delete route sheet' });
    }
});

export default router;
