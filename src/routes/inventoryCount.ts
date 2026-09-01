import express from 'express';
import pool from '../db.js';
import { userAuth, requirePermission, AuthRequest } from '../middleware/auth.js';
import { generateDocNumber } from '../utils/docNumberGenerator.js';
import { InventoryCountService } from '../services/inventoryCountService.js';
import { AuditService } from '../services/auditService.js';

const router = express.Router();

// GET list of Inventory Count documents
router.get('/', userAuth, async (req: AuthRequest, res) => {
    try {
        const { warehouseId, status, dateFrom, dateTo } = req.query;
        let query = `
            SELECT ic.*, w.name as "warehouseName", u.name as "creatorName", pu.name as "posterName"
            FROM "InventoryCount" ic
            LEFT JOIN "Warehouse" w ON ic."warehouseId" = w.id
            LEFT JOIN "User" u ON ic."createdBy" = u.id
            LEFT JOIN "User" pu ON ic."postedBy" = pu.id
            WHERE 1=1
        `;
        const params: any[] = [];
        let idx = 1;

        if (warehouseId) {
            query += ` AND ic."warehouseId" = $${idx++}`;
            params.push(warehouseId);
        }
        if (status) {
            query += ` AND ic."status" = $${idx++}`;
            params.push(status);
        }
        if (dateFrom) {
            query += ` AND ic."date" >= $${idx++}`;
            params.push(dateFrom);
        }
        if (dateTo) {
            query += ` AND ic."date" <= $${idx++}`;
            params.push(dateTo);
        }

        query += ` ORDER BY ic."date" DESC, ic."createdAt" DESC`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching inventory counts:', error);
        res.status(500).json({ message: 'Failed to fetch inventory counts' });
    }
});

// GET stock auto-fill for warehouse
router.get('/stock-fill/:warehouseId', userAuth, async (req: AuthRequest, res) => {
    try {
        const warehouseId = req.params.warehouseId as string;
        const items = await InventoryCountService.getStockForWarehouse(warehouseId);
        res.json(items);
    } catch (error) {
        console.error('Error fetching stock fill:', error);
        res.status(500).json({ message: 'Failed to fetch warehouse stock' });
    }
});

// GET single Inventory Count document with items
router.get('/:id', userAuth, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const docRes = await pool.query(`
            SELECT ic.*, w.name as "warehouseName", u.name as "creatorName"
            FROM "InventoryCount" ic
            LEFT JOIN "Warehouse" w ON ic."warehouseId" = w.id
            LEFT JOIN "User" u ON ic."createdBy" = u.id
            WHERE ic.id = $1
        `, [id]);

        if (docRes.rows.length === 0) {
            return res.status(404).json({ message: 'Inventory Count not found' });
        }

        const itemsRes = await pool.query(`
            SELECT ici.*, p.name as "productName", p.code as "productCode", p.unit
            FROM "InventoryCountItem" ici
            JOIN "Product" p ON ici."productId" = p.id
            WHERE ici."inventoryCountId" = $1
            ORDER BY ici."sortOrder" ASC
        `, [id]);

        res.json({
            ...docRes.rows[0],
            items: itemsRes.rows
        });
    } catch (error) {
        console.error('Error fetching inventory count:', error);
        res.status(500).json({ message: 'Failed to fetch document' });
    }
});

// POST Create Inventory Count document
router.post('/', userAuth, async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { warehouseId, date, comment, items } = req.body;

        if (!warehouseId) {
            throw new Error('Склад є обов’язковим полем');
        }

        const number = await generateDocNumber('INV', 'InventoryCount');
        const docDate = date ? new Date(date) : new Date();

        let totalAccountingAmount = 0;
        let totalActualAmount = 0;
        let totalSurplusAmount = 0;
        let totalShortageAmount = 0;

        if (items && Array.isArray(items)) {
            items.forEach((item: any) => {
                const acQty = Number(item.accountingQty || 0);
                const actQty = Number(item.actualQty || 0);
                const price = Number(item.price || 0);

                const acTotal = acQty * price;
                const actTotal = actQty * price;
                const diffTotal = (actQty - acQty) * price;

                totalAccountingAmount += acTotal;
                totalActualAmount += actTotal;
                if (diffTotal > 0) totalSurplusAmount += diffTotal;
                if (diffTotal < 0) totalShortageAmount += Math.abs(diffTotal);
            });
        }

        const docRes = await client.query(`
            INSERT INTO "InventoryCount" (
                "number", "date", "warehouseId", "status", "comment",
                "totalAccountingAmount", "totalActualAmount", "totalSurplusAmount", "totalShortageAmount",
                "createdBy", "createdAt", "updatedAt"
            ) VALUES ($1, $2, $3, 'DRAFT', $4, $5, $6, $7, $8, $9, NOW(), NOW())
            RETURNING *
        `, [
            number, docDate, warehouseId, comment || null,
            totalAccountingAmount, totalActualAmount, totalSurplusAmount, totalShortageAmount,
            req.user?.id || null
        ]);

        const docId = docRes.rows[0].id;

        if (items && Array.isArray(items)) {
            for (const [index, item] of items.entries()) {
                const acQty = Number(item.accountingQty || 0);
                const actQty = Number(item.actualQty || 0);
                const price = Number(item.price || 0);

                const acTotal = acQty * price;
                const actTotal = actQty * price;
                const diffTotal = (actQty - acQty) * price;

                await client.query(`
                    INSERT INTO "InventoryCountItem" (
                        "inventoryCountId", "productId", "accountingQty", "actualQty", "price",
                        "accountingTotal", "actualTotal", "differenceTotal", "sortOrder"
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [
                    docId, item.productId, acQty, actQty, price,
                    acTotal, actTotal, diffTotal, index
                ]);
            }
        }

        await client.query('COMMIT');
        res.status(201).json(docRes.rows[0]);
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error creating inventory count:', error);
        res.status(400).json({ message: error.message || 'Failed to create inventory count' });
    } finally {
        client.release();
    }
});

// PUT Update Inventory Count document
router.put('/:id', userAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const checkRes = await client.query('SELECT status FROM "InventoryCount" WHERE id = $1', [id]);
        if (checkRes.rows.length === 0) throw new Error('Document not found');
        if (checkRes.rows[0].status === 'POSTED') throw new Error('Cannot edit a posted document');

        const { warehouseId, date, comment, items } = req.body;
        const docDate = date ? new Date(date) : undefined;

        let totalAccountingAmount = 0;
        let totalActualAmount = 0;
        let totalSurplusAmount = 0;
        let totalShortageAmount = 0;

        if (items && Array.isArray(items)) {
            items.forEach((item: any) => {
                const acQty = Number(item.accountingQty || 0);
                const actQty = Number(item.actualQty || 0);
                const price = Number(item.price || 0);

                const acTotal = acQty * price;
                const actTotal = actQty * price;
                const diffTotal = (actQty - acQty) * price;

                totalAccountingAmount += acTotal;
                totalActualAmount += actTotal;
                if (diffTotal > 0) totalSurplusAmount += diffTotal;
                if (diffTotal < 0) totalShortageAmount += Math.abs(diffTotal);
            });
        }

        await client.query(`
            UPDATE "InventoryCount"
            SET "warehouseId" = COALESCE($1, "warehouseId"),
                "date" = COALESCE($2, "date"),
                "comment" = COALESCE($3, "comment"),
                "totalAccountingAmount" = $4,
                "totalActualAmount" = $5,
                "totalSurplusAmount" = $6,
                "totalShortageAmount" = $7,
                "updatedAt" = NOW()
            WHERE id = $8
        `, [
            warehouseId, docDate, comment,
            totalAccountingAmount, totalActualAmount, totalSurplusAmount, totalShortageAmount,
            id
        ]);

        if (items && Array.isArray(items)) {
            await client.query('DELETE FROM "InventoryCountItem" WHERE "inventoryCountId" = $1', [id]);
            for (const [index, item] of items.entries()) {
                const acQty = Number(item.accountingQty || 0);
                const actQty = Number(item.actualQty || 0);
                const price = Number(item.price || 0);

                const acTotal = acQty * price;
                const actTotal = actQty * price;
                const diffTotal = (actQty - acQty) * price;

                await client.query(`
                    INSERT INTO "InventoryCountItem" (
                        "inventoryCountId", "productId", "accountingQty", "actualQty", "price",
                        "accountingTotal", "actualTotal", "differenceTotal", "sortOrder"
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [
                    id, item.productId, acQty, actQty, price,
                    acTotal, actTotal, diffTotal, index
                ]);
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'Document updated successfully' });
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error updating inventory count:', error);
        res.status(400).json({ message: error.message || 'Failed to update document' });
    } finally {
        client.release();
    }
});

// POST (Провести) Inventory Count
router.post('/:id/post', userAuth, async (req: AuthRequest, res) => {
    try {
        const id = req.params.id as string;
        const userId = req.user?.id || '';
        const result = await InventoryCountService.post(id, userId, req.user);
        res.json(result);
    } catch (error: any) {
        console.error('POST INVENTORY COUNT ERROR:', error);
        res.status(400).json({ message: error.message || 'Failed to post inventory count' });
    }
});

// DELETE Inventory Count document
router.delete('/:id', userAuth, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const checkRes = await pool.query('SELECT status FROM "InventoryCount" WHERE id = $1', [id]);
        if (checkRes.rows.length === 0) return res.status(404).json({ message: 'Document not found' });
        if (checkRes.rows[0].status === 'POSTED') return res.status(400).json({ message: 'Cannot delete a posted document' });

        await pool.query('DELETE FROM "InventoryCount" WHERE id = $1', [id]);
        res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
        console.error('DELETE INVENTORY COUNT ERROR:', error);
        res.status(500).json({ message: 'Failed to delete document' });
    }
});

export default router;
