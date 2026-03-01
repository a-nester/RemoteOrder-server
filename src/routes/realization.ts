import express from 'express';
import pool from '../db.js';
import { userAuth, AuthRequest } from '../middleware/auth.js';
import { generateDocNumber } from '../utils/docNumberGenerator.js';
import { InventoryService } from '../services/inventoryService.js';

const router = express.Router();

// List Realizations
router.get('/', userAuth, async (req, res) => {
    try {
        const { includeDeleted } = req.query;
        let query = `
            SELECT r.*, c.name as "counterpartyName", w.name as "warehouseName"
            FROM "Realization" r
            LEFT JOIN "Counterparty" c ON r."counterpartyId" = c.id
            LEFT JOIN "Warehouse" w ON r."warehouseId" = w.id
            WHERE 1=1
        `;

        if (includeDeleted !== 'true') {
            query += ` AND r."isDeleted" = FALSE`;
        }

        query += ` ORDER BY r.date DESC`;
        
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching realizations:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get Realization Details
router.get('/:id', userAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const realization = await pool.query(`
            SELECT r.*, c.name as "counterpartyName", w.name as "warehouseName"
            FROM "Realization" r
            LEFT JOIN "Counterparty" c ON r."counterpartyId" = c.id
            LEFT JOIN "Warehouse" w ON r."warehouseId" = w.id
            WHERE r.id = $1
        `, [id]);

        if ((realization.rowCount || 0) === 0) return res.status(404).json({ message: 'Realization not found' });

        const items = await pool.query(`
            SELECT ri.*, p.name as "productName"
            FROM "RealizationItem" ri
            LEFT JOIN "Product" p ON ri."productId" = p.id::text -- Cast for compatibility if product id is distinct type
            WHERE ri."realizationId" = $1
        `, [id]);

        res.json({
            ...realization.rows[0],
            items: items.rows
        });
    } catch (error) {
        console.error('Error fetching realization details:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create Manual Realization
router.post('/', userAuth, async (req, res) => {
    const { date, counterpartyId, warehouseId, amount, comment, items } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Number Generation
        const number = await generateDocNumber('Realization', new Date(), 'number');
        const userId = (req as AuthRequest).user?.id;

        // Insert Header
        const realizationRes = await client.query(`
            INSERT INTO "Realization" (
                "date", "number", "counterpartyId", "warehouseId", "status", "amount", "currency", "createdBy", "comment"
            ) VALUES (
               COALESCE($1, NOW()), $2, $3, $4, 'DRAFT', $5, 'UAH', $6, $7
            ) RETURNING id
        `, [date, number, counterpartyId, warehouseId, amount, userId, comment]);

        const realizationId = realizationRes.rows[0].id;

        // Insert Items
        if (items && Array.isArray(items)) {
            for (const item of items) {
                await client.query(`
                    INSERT INTO "RealizationItem" ("realizationId", "productId", "quantity", "price", "total")
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    realizationId,
                    item.productId,
                    item.quantity,
                    item.sellPrice || item.price,
                    item.total
                ]);
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ id: realizationId, message: 'Realization created successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating manual realization:', error);
        res.status(500).json({ message: error instanceof Error ? error.message : 'Server error' });
    } finally {
        client.release();
    }
});

// Create Realization from Order
router.post('/from-order/:orderId', userAuth, async (req, res) => {
    const { orderId } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Fetch Order
        const orderRes = await client.query('SELECT * FROM "Order" WHERE id = $1', [orderId]);
        if ((orderRes.rowCount || 0) === 0) throw new Error('Order not found');
        const order = orderRes.rows[0];

        // 2. Fetch Order Items
        const itemsRes = await client.query('SELECT * FROM "OrderItem" WHERE "orderId" = $1', [orderId]);
        const items = itemsRes.rows;

        // 3. Determine Warehouse (from Counterparty or Default)
        // Check Counterparty for default warehouse
        let warehouseId = null;
        if (order.counterpartyId) {
            const cpRes = await client.query('SELECT "warehouseId" FROM "Counterparty" WHERE id = $1', [order.counterpartyId]);
            if ((cpRes.rowCount || 0) > 0) warehouseId = cpRes.rows[0].warehouseId;
        }

        // Fallback to Main Warehouse if not set
        if (!warehouseId) {
            const whRes = await client.query('SELECT id FROM "Warehouse" LIMIT 1');
            if ((whRes.rowCount || 0) > 0) warehouseId = whRes.rows[0].id;
        }

        // 4. Generate Number
        const number = await generateDocNumber('Realization', new Date(), 'number');

        // 5. Create Realization Header
        const userId = (req as AuthRequest).user?.id;

        const realizationRes = await client.query(`
            INSERT INTO "Realization" (
                "date", "number", "counterpartyId", "warehouseId", "status", "amount", "currency", "createdBy", "orderId"
            ) VALUES (
               NOW(), $1, $2, $3, 'DRAFT', $4, $5, $6, $7
            ) RETURNING id
        `, [number, order.counterpartyId, warehouseId, order.total, order.currency, userId, orderId]);

        // Update Order Status to ACCEPTED
        await client.query(`UPDATE "Order" SET "status" = 'ACCEPTED', "updatedAt" = NOW() WHERE "id" = $1`, [orderId]);

        const realizationId = realizationRes.rows[0].id;

        // 6. Create Realization Items
        for (const item of items) {
            await client.query(`
                INSERT INTO "RealizationItem" ("realizationId", "productId", "quantity", "price", "total")
                VALUES ($1, $2, $3, $4, $5)
            `, [
                realizationId,
                item.productId,
                item.quantity,
                item.sellPrice,
                Number(item.quantity) * Number(item.sellPrice)
            ]);
        }

        await client.query('COMMIT');
        res.status(201).json({ id: realizationId, message: 'Realization created successfully' });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating realization from order:', error);
        res.status(500).json({ message: error instanceof Error ? error.message : 'Server error' });
    } finally {
        client.release();
    }
});

// Edit Realization
router.put('/:id', userAuth, async (req, res) => {
    const { id } = req.params;
    const { date, counterpartyId, warehouseId, amount, items, comment } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Check if exists and not posted
        const realRes = await client.query('SELECT status FROM "Realization" WHERE id = $1', [id]);
        if (realRes.rowCount === 0) throw new Error('Realization not found');
        if (realRes.rows[0].status === 'POSTED') throw new Error('Cannot edit a POSTED realization');

        // Update Header
        await client.query(`
            UPDATE "Realization"
            SET "date" = COALESCE($1, "date"),
                "counterpartyId" = COALESCE($2, "counterpartyId"),
                "warehouseId" = COALESCE($3, "warehouseId"),
                "comment" = COALESCE($4, "comment"),
                "amount" = COALESCE($5, "amount"),
                "updatedAt" = NOW()
            WHERE id = $6
        `, [date, counterpartyId, warehouseId, comment, amount, id]);

        // If items are provided, wipe and recreate (easier than delta patching)
        if (items && Array.isArray(items)) {
            await client.query('DELETE FROM "RealizationItem" WHERE "realizationId" = $1', [id]);
            for (const item of items) {
                await client.query(`
                    INSERT INTO "RealizationItem" ("realizationId", "productId", "quantity", "price", "total")
                    VALUES ($1, $2, $3, $4, $5)
                `, [id, item.productId, item.quantity, item.sellPrice || item.price, item.total]);
            }
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating realization:', error);
        res.status(500).json({ message: error instanceof Error ? error.message : 'Server error' });
    } finally {
        client.release();
    }
});

// POST (Провести) Realization

router.post('/:id/post', userAuth, async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Get current realization
        const docRes = await client.query('SELECT * FROM "Realization" WHERE id = $1 FOR UPDATE', [id]);
        if (docRes.rowCount === 0) throw new Error('Realization not found');
        const doc = docRes.rows[0];

        if (doc.status === 'POSTED') {
            throw new Error('Realization is already POSTED');
        }

        // 2. Get items
        const itemsRes = await client.query('SELECT * FROM "RealizationItem" WHERE "realizationId" = $1', [id]);
        const items = itemsRes.rows;

        let totalCostPrice = 0;
        let totalSellPrice = Number(doc.amount);

        // 3. Process each item (FIFO deduct)
        for (const item of items) {
            const productId = item.productId;
            const quantityNeeded = Number(item.quantity);

            // Deduct stock and get breakdown of batches used
            const deductions = await InventoryService.deductStock(client, productId, quantityNeeded);

            for (const deduction of deductions) {
                // Record the batch deduction
                await client.query(`
                    INSERT INTO "RealizationItemBatch" ("realizationItemId", "productBatchId", "quantity", "enterPrice")
                    VALUES ($1, $2, $3, $4)
                `, [item.id, deduction.batchId, deduction.quantity, deduction.enterPrice]);

                // Accumulate cost price
                totalCostPrice += (deduction.quantity * deduction.enterPrice);
            }
        }

        // 4. Calculate profit
        const profit = totalSellPrice - totalCostPrice;

        // 5. Build comment tag if any profit warning
        let statusComment = doc.comment ? doc.comment + ' ' : '';
        if (profit < 0) statusComment += '[WARNING: Negative Profit]';

        // 6. Update Realization Status
        await client.query(`
            UPDATE "Realization"
            SET "status" = 'POSTED', "profit" = $1, "comment" = $2, "updatedAt" = NOW()
            WHERE id = $3
        `, [profit, statusComment.trim() || null, id]);

        // 7. Update linked Order if exists
        if (doc.orderId) {
            await client.query(`UPDATE "Order" SET "status" = 'COMPLETED', "updatedAt" = NOW() WHERE "id" = $1`, [doc.orderId]);
        }

        await client.query('COMMIT');
        res.json({ success: true, profit });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error posting realization:', error);
        res.status(400).json({ message: error instanceof Error ? error.message : 'Failed to post' });
    } finally {
        client.release();
    }
});

// UNPOST (розпровести) Realization

router.post('/:id/unpost', userAuth, async (req, res) => {
    const id = req.params.id;

    if (!id || Array.isArray(id)) {
        return res.status(400).json({ message: 'Invalid realization id' });}
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1️⃣ Заблокувати реалізацію
        const docRes = await client.query(
            'SELECT * FROM "Realization" WHERE id = $1 FOR UPDATE',
            [id]
        );

        if (docRes.rowCount === 0) throw new Error('Realization not found');

        const realization = docRes.rows[0];

        if (realization.status !== 'POSTED')
            throw new Error('Only POSTED realizations can be unposted');

        // 2️⃣ Повернення складу через InventoryService
        await InventoryService.returnStock(client, id);

        // 3️⃣ Видалення batch записів
        await client.query(`
            DELETE FROM "RealizationItemBatch"
            WHERE "realizationItemId" IN (
                SELECT id FROM "RealizationItem"
                WHERE "realizationId" = $1
            )
        `, [id]);

        // 4️⃣ Оновлення статусу і profit
        // Якщо profit колонка NOT NULL, ставимо 0
        const resetProfit = realization.profit !== undefined ? 0 : null;

        await client.query(`
            UPDATE "Realization"
            SET status = 'DRAFT',
                profit = $1,
                "updatedAt" = NOW()
            WHERE id = $2
        `, [resetProfit, id]);

        // 5. Revert linked Order if exists
        if (realization.orderId) {
            await client.query(`UPDATE "Order" SET "status" = 'ACCEPTED', "updatedAt" = NOW() WHERE "id" = $1`, [realization.orderId]);
        }

        await client.query('COMMIT');
        res.json({ success: true });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('UNPOST ERROR:', error);
        res.status(400).json({ message: error.message || 'Failed to unpost realization' });
    } finally {
        client.release();
    }
});

// Delete Realization
router.delete('/:id', userAuth, async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const checkRes = await client.query('SELECT status FROM "Realization" WHERE id = $1', [id]);
        if ((checkRes.rowCount || 0) === 0) {
            throw new Error('Realization not found');
        }
        
        const status = checkRes.rows[0].status;
        if (status === 'POSTED') {
            throw new Error('Cannot delete a posted realization');
        }

        await client.query(`
            UPDATE "Realization"
            SET "isDeleted" = TRUE, "updatedAt" = NOW()
            WHERE id = $1
        `, [id]);

        await client.query('COMMIT');
        res.json({ success: true, message: 'Realization deleted successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting realization:', error);
        res.status(400).json({ message: error instanceof Error ? error.message : 'Failed to delete' });
    } finally {
        client.release();
    }
});

export default router;
