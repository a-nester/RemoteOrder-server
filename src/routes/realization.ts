import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// List Realizations
router.get('/', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.*, c.name as "counterpartyName", w.name as "warehouseName"
            FROM "Realization" r
            LEFT JOIN "Counterparty" c ON r."counterpartyId" = c.id
            LEFT JOIN "Warehouse" w ON r."warehouseId" = w.id
            WHERE r."isDeleted" = FALSE
            ORDER BY r.date DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching realizations:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get Realization Details
router.get('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const realization = await pool.query(`
            SELECT r.*, c.name as "counterpartyName", w.name as "warehouseName"
            FROM "Realization" r
            LEFT JOIN "Counterparty" c ON r."counterpartyId" = c.id
            LEFT JOIN "Warehouse" w ON r."warehouseId" = w.id
            WHERE r.id = $1
        `, [id]);

        if (realization.rowCount === 0) return res.status(404).json({ message: 'Realization not found' });

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

// Create Realization from Order
router.post('/from-order/:orderId', authenticateToken, async (req, res) => {
    const { orderId } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Fetch Order
        const orderRes = await client.query('SELECT * FROM "Order" WHERE id = $1', [orderId]);
        if (orderRes.rowCount === 0) throw new Error('Order not found');
        const order = orderRes.rows[0];

        // 2. Fetch Order Items
        const itemsRes = await client.query('SELECT * FROM "OrderItem" WHERE "orderId" = $1', [orderId]);
        const items = itemsRes.rows;

        // 3. Determine Warehouse (from Counterparty or Default)
        // Check Counterparty for default warehouse
        let warehouseId = null;
        if (order.counterpartyId) {
            const cpRes = await client.query('SELECT "warehouseId" FROM "Counterparty" WHERE id = $1', [order.counterpartyId]);
            if (cpRes.rowCount > 0) warehouseId = cpRes.rows[0].warehouseId;
        }

        // Fallback to Main Warehouse if not set
        if (!warehouseId) {
            const whRes = await client.query('SELECT id FROM "Warehouse" LIMIT 1');
            if (whRes.rowCount > 0) warehouseId = whRes.rows[0].id;
        }

        // 4. Generate Number (Simple Auto-increment logic or timestamp for MVP)
        const number = `R-${Date.now().toString().slice(-6)}`;

        // 5. Create Realization Header
        const realizationRes = await client.query(`
            INSERT INTO "Realization" (
                "userId", -- Assuming user ownership if needed, or link to creator
                "date", "number", "counterpartyId", "warehouseId", "status", "amount", "currency", "createdBy"
            ) VALUES (
               $1, NOW(), $2, $3, $4, 'DRAFT', $5, $6, $7
            ) RETURNING id
        `, [order.userId, number, order.counterpartyId, warehouseId, order.total, order.currency, req.user?.id]);

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

export default router;
