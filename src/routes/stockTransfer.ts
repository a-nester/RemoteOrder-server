import express from 'express';
import pool from '../db.js';
import { userAuth, requirePermission, AuthRequest } from '../middleware/auth.js';
import { generateDocNumber } from '../utils/docNumberGenerator.js';
import { StockTransferService } from '../services/stockTransferService.js';
import { AuditService } from '../services/auditService.js';

const router = express.Router();

// GET list of Stock Transfer documents
router.get('/', userAuth, async (req: AuthRequest, res) => {
    try {
        const { fromWarehouseId, toWarehouseId, status, dateFrom, dateTo } = req.query;
        let query = `
            SELECT st.*, 
                   fw.name as "fromWarehouseName", 
                   tw.name as "toWarehouseName", 
                   u.name as "creatorName", 
                   pu.name as "posterName"
            FROM "StockTransfer" st
            LEFT JOIN "Warehouse" fw ON st."fromWarehouseId" = fw.id
            LEFT JOIN "Warehouse" tw ON st."toWarehouseId" = tw.id
            LEFT JOIN "User" u ON st."createdBy" = u.id
            LEFT JOIN "User" pu ON st."postedBy" = pu.id
            WHERE 1=1
        `;
        const params: any[] = [];
        let idx = 1;

        if (fromWarehouseId) {
            query += ` AND st."fromWarehouseId" = $${idx++}`;
            params.push(fromWarehouseId);
        }
        if (toWarehouseId) {
            query += ` AND st."toWarehouseId" = $${idx++}`;
            params.push(toWarehouseId);
        }
        if (status) {
            query += ` AND st."status" = $${idx++}`;
            params.push(status);
        }
        if (dateFrom) {
            query += ` AND st."date" >= $${idx++}`;
            params.push(dateFrom);
        }
        if (dateTo) {
            query += ` AND st."date" <= $${idx++}`;
            params.push(dateTo);
        }

        query += ` ORDER BY st."date" DESC, st."createdAt" DESC`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching stock transfers:', error);
        res.status(500).json({ message: 'Failed to fetch stock transfers' });
    }
});

// GET stock fill for sender warehouse
router.get('/stock-fill/:warehouseId', userAuth, async (req: AuthRequest, res) => {
    try {
        const warehouseId = req.params.warehouseId as string;
        const items = await StockTransferService.getStockForWarehouse(warehouseId);
        res.json(items);
    } catch (error) {
        console.error('Error fetching warehouse stock fill:', error);
        res.status(500).json({ message: 'Failed to fetch warehouse stock' });
    }
});

// GET single Stock Transfer document with items
router.get('/:id', userAuth, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const docRes = await pool.query(`
            SELECT st.*, 
                   fw.name as "fromWarehouseName", 
                   tw.name as "toWarehouseName", 
                   u.name as "creatorName"
            FROM "StockTransfer" st
            LEFT JOIN "Warehouse" fw ON st."fromWarehouseId" = fw.id
            LEFT JOIN "Warehouse" tw ON st."toWarehouseId" = tw.id
            LEFT JOIN "User" u ON st."createdBy" = u.id
            WHERE st.id = $1
        `, [id]);

        if (docRes.rows.length === 0) {
            return res.status(404).json({ message: 'Stock Transfer document not found' });
        }

        const itemsRes = await pool.query(`
            SELECT sti.*, p.name as "productName", p.code as "productCode", p.unit
            FROM "StockTransferItem" sti
            JOIN "Product" p ON sti."productId" = p.id
            WHERE sti."stockTransferId" = $1
            ORDER BY sti."sortOrder" ASC
        `, [id]);

        res.json({
            ...docRes.rows[0],
            items: itemsRes.rows
        });
    } catch (error) {
        console.error('Error fetching stock transfer:', error);
        res.status(500).json({ message: 'Failed to fetch document' });
    }
});

// POST Create Stock Transfer document
router.post('/', userAuth, async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { fromWarehouseId, toWarehouseId, date, comment, items } = req.body;

        if (!fromWarehouseId || !toWarehouseId) {
            throw new Error('Склад-відправник та Склад-отримувач є обов’язковими полями');
        }
        if (fromWarehouseId === toWarehouseId) {
            throw new Error('Склад-відправник та Склад-отримувач мають бути різними');
        }

        const number = await generateDocNumber('PER', 'StockTransfer');
        const docDate = date ? new Date(date) : new Date();

        let totalAmount = 0;
        if (items && Array.isArray(items)) {
            items.forEach((item: any) => {
                const qty = Number(item.quantity || 0);
                const price = Number(item.price || 0);
                totalAmount += qty * price;
            });
        }

        const docRes = await client.query(`
            INSERT INTO "StockTransfer" (
                "number", "date", "fromWarehouseId", "toWarehouseId", "status", "comment",
                "totalAmount", "createdBy", "createdAt", "updatedAt"
            ) VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6, $7, NOW(), NOW())
            RETURNING *
        `, [
            number, docDate, fromWarehouseId, toWarehouseId, comment || null,
            totalAmount, req.user?.id || null
        ]);

        const docId = docRes.rows[0].id;

        if (items && Array.isArray(items)) {
            for (const [index, item] of items.entries()) {
                const qty = Number(item.quantity || 0);
                const price = Number(item.price || 0);
                const total = qty * price;

                await client.query(`
                    INSERT INTO "StockTransferItem" (
                        "stockTransferId", "productId", "quantity", "price", "total", "sortOrder"
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                `, [
                    docId, item.productId, qty, price, total, index
                ]);
            }
        }

        await client.query('COMMIT');
        res.status(201).json(docRes.rows[0]);
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error creating stock transfer:', error);
        res.status(400).json({ message: error.message || 'Failed to create stock transfer' });
    } finally {
        client.release();
    }
});

// PUT Update Stock Transfer document
router.put('/:id', userAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const checkRes = await client.query('SELECT status FROM "StockTransfer" WHERE id = $1', [id]);
        if (checkRes.rows.length === 0) throw new Error('Document not found');
        if (checkRes.rows[0].status === 'POSTED') throw new Error('Cannot edit a posted document');

        const { fromWarehouseId, toWarehouseId, date, comment, items } = req.body;
        if (fromWarehouseId && toWarehouseId && fromWarehouseId === toWarehouseId) {
            throw new Error('Склад-відправник та Склад-отримувач мають бути різними');
        }

        const docDate = date ? new Date(date) : undefined;

        let totalAmount = 0;
        if (items && Array.isArray(items)) {
            items.forEach((item: any) => {
                const qty = Number(item.quantity || 0);
                const price = Number(item.price || 0);
                totalAmount += qty * price;
            });
        }

        await client.query(`
            UPDATE "StockTransfer"
            SET "fromWarehouseId" = COALESCE($1, "fromWarehouseId"),
                "toWarehouseId" = COALESCE($2, "toWarehouseId"),
                "date" = COALESCE($3, "date"),
                "comment" = COALESCE($4, "comment"),
                "totalAmount" = $5,
                "updatedAt" = NOW()
            WHERE id = $6
        `, [
            fromWarehouseId, toWarehouseId, docDate, comment,
            totalAmount, id
        ]);

        if (items && Array.isArray(items)) {
            await client.query('DELETE FROM "StockTransferItem" WHERE "stockTransferId" = $1', [id]);
            for (const [index, item] of items.entries()) {
                const qty = Number(item.quantity || 0);
                const price = Number(item.price || 0);
                const total = qty * price;

                await client.query(`
                    INSERT INTO "StockTransferItem" (
                        "stockTransferId", "productId", "quantity", "price", "total", "sortOrder"
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                `, [
                    id, item.productId, qty, price, total, index
                ]);
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'Document updated successfully' });
    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error updating stock transfer:', error);
        res.status(400).json({ message: error.message || 'Failed to update document' });
    } finally {
        client.release();
    }
});

// POST (Провести) Stock Transfer
router.post('/:id/post', userAuth, async (req: AuthRequest, res) => {
    try {
        const id = req.params.id as string;
        const userId = req.user?.id || '';
        const result = await StockTransferService.post(id, userId, req.user);
        res.json(result);
    } catch (error: any) {
        console.error('POST STOCK TRANSFER ERROR:', error);
        res.status(400).json({ message: error.message || 'Failed to post stock transfer' });
    }
});

// DELETE Stock Transfer document
router.delete('/:id', userAuth, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;
        const checkRes = await pool.query('SELECT status FROM "StockTransfer" WHERE id = $1', [id]);
        if (checkRes.rows.length === 0) return res.status(404).json({ message: 'Document not found' });
        if (checkRes.rows[0].status === 'POSTED') return res.status(400).json({ message: 'Cannot delete a posted document' });

        await pool.query('DELETE FROM "StockTransfer" WHERE id = $1', [id]);
        res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
        console.error('DELETE STOCK TRANSFER ERROR:', error);
        res.status(500).json({ message: 'Failed to delete document' });
    }
});

export default router;
