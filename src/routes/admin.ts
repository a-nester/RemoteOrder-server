import { Router, Request, Response } from 'express';
import pool from '../db.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { adminAuth } from '../middleware/auth.js';
import { generateDocNumber } from '../utils/docNumberGenerator.js';

// removed MulterRequest interface to avoid conflict

const router = Router();

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: (req: any, file: any, cb: any) => {
        const uploadDir = 'uploads/';
        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req: any, file: any, cb: any) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Apply admin auth to all routes in this router
router.use(adminAuth);

// ➕ Create Product
router.post('/products', upload.array('photos', 5), async (req: Request, res: Response) => {
    try {
        const { name, unit, category, prices } = req.body;
        const files = (req as any).files as any[] || [];
        const photoUrls = files ? files.map((file: any) => `/uploads/${file.filename}`) : [];

        // Parse prices if sent as string (e.g. from FormData)
        let parsedPrices = prices;
        if (typeof prices === 'string') {
            try {
                parsedPrices = JSON.parse(prices);
            } catch (e) {
                parsedPrices = { standard: 0 };
            }
        }

        const result = await pool.query(
            `INSERT INTO "Product" ("name", "unit", "category", "prices", "photos")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
            [name, unit, category, JSON.stringify(parsedPrices), photoUrls]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({ error: 'Failed to create product' });
    }
});

// ✏️ Update Product
router.put('/products/:id', upload.array('photos', 5), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, unit, category, prices, existingPhotos } = req.body;
        const files = (req as any).files as any[] || [];

        const newPhotoUrls = files ? files.map((file: any) => `/uploads/${file.filename}`) : [];

        // Parse prices
        let parsedPrices = prices;
        if (typeof prices === 'string') {
            try {
                parsedPrices = JSON.parse(prices);
            } catch (e) {
                // keep existing if invalid? or default. 
            }
        }

        // Handle photos: combine existing (kept) + new
        let finalPhotos = newPhotoUrls;
        if (existingPhotos) {
            const keptPhotos = Array.isArray(existingPhotos) ? existingPhotos : [existingPhotos];
            finalPhotos = [...keptPhotos, ...newPhotoUrls];
        }

        // Dynamic update query construction
        // Simple version: update all fields (assuming they are provided)
        // For a robust implementation, we should check which fields are present.
        // For now, assuming the admin UI sends full object or we use COALESCE.

        const query = `
      UPDATE "Product"
      SET "name" = COALESCE($2, "name"),
          "unit" = COALESCE($3, "unit"),
          "category" = COALESCE($4, "category"),
          "prices" = COALESCE($5, "prices"),
          "photos" = COALESCE($6, "photos"),
          "updatedAt" = NOW()
      WHERE "id" = $1
      RETURNING *
    `;

        const result = await pool.query(query, [
            id,
            name,
            unit,
            category,
            parsedPrices ? JSON.stringify(parsedPrices) : null,
            finalPhotos.length > 0 ? finalPhotos : null // If no photos provided/kept, COALESCE keeps existing? No, COALESCE($6, "photos") works if $6 is null. 
            // Issue: If I want to delete all photos, I should send empty array. But empty array is not null.
            // Adjust logic: if existingPhotos and files are undefined/null, don't update photos?
            // Or explicit "deletePhotos" action?
            // Let's assume frontend sends the final list of photos logic slightly differently or we just update if 'photos' field is implicitly handled.
            // Better approach for PUT: replace the collection.
        ]);

        // Let's refine the photo logic for PUT to be "Replace photos with provided list" + "Add new uploaded files".
        // If the user wants to keep old photos, they must send them in 'existingPhotos'.
        // If 'existingPhotos' is missing, it implies "remove old photos" (if we follow strict PUT), 
        // BUT since we have file upload, it's tricky.
        // Let's stick to: finalPhotos = (existingPhotos || []) + newFiles.

        const updatePhotos = existingPhotos || files.length > 0;

        let dbResult;

        if (updatePhotos) {
            dbResult = await pool.query(`
            UPDATE "Product"
            SET "name" = $2, "unit" = $3, "category" = $4, "prices" = $5, "photos" = $6, "updatedAt" = NOW()
            WHERE "id" = $1 RETURNING *`,
                [id, name, unit, category, JSON.stringify(parsedPrices), finalPhotos]
            );
        } else {
            // Don't update photos
            dbResult = await pool.query(`
            UPDATE "Product"
            SET "name" = $2, "unit" = $3, "category" = $4, "prices" = $5, "updatedAt" = NOW()
            WHERE "id" = $1 RETURNING *`,
                [id, name, unit, category, JSON.stringify(parsedPrices)]
            );
        }

        res.json(dbResult.rows[0]);
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// ❌ Delete Product (Soft Delete)
router.delete('/products/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await pool.query('UPDATE "Product" SET "deleted" = true, "updatedAt" = NOW() WHERE "id" = $1', [id]);
        res.json({ success: true, message: 'Product deleted' });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

import { InventoryController } from '../controllers/inventoryController.js';
import { PriceController } from '../controllers/priceController.js';

// 📦 Inventory Management
router.post('/inventory/arrival', InventoryController.addArrival);
router.get('/inventory/stock/:productId', InventoryController.getStock);

// 💰 Price Management
router.post('/prices/set', PriceController.setPrice);
router.get('/prices/history/:productId', PriceController.getHistory);

// ➕ Create Order
router.post('/orders', async (req: Request, res: Response) => {
    console.log('[POST /orders] Body:', JSON.stringify(req.body, null, 2));
    const client = await pool.connect();
    try {
        const { date, counterpartyId, status, items, comment, amount, currency } = req.body;
        let userId = (req as any).user.id;

        // If using admin secret (legacy), user.id might be undefined.
        // Use a placeholder UUID for system admin actions.
        // If using admin secret (legacy) or if ID is missing for some reason,
        // Use a placeholder UUID for system admin/manager actions.
        if (!userId && ((req as any).user.role === 'admin' || (req as any).user.role === 'manager')) {
            // System Admin UUID
            userId = '00000000-0000-0000-0000-000000000000';
        }

        if (!userId) {
            console.error('[POST /orders] Missing userId in request');
            return res.status(400).json({ error: 'User ID is required to create an order' });
        }
        const id = crypto.randomUUID();

        // Generate Document Number
        const docNumber = await generateDocNumber('Order', date ? new Date(date) : new Date());

        console.log(`[POST /orders] Creating order ${id} (No. ${docNumber}) for user ${userId}, counterparty ${counterpartyId}`);

        await client.query('BEGIN');

        const insertQuery = `
            INSERT INTO "Order" (id, "userId", "counterpartyId", status, total, items, comment, "docNumber", "createdAt", "updatedAt")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            RETURNING *
        `;

        const result = await client.query(insertQuery, [
            id,
            userId,
            counterpartyId,
            status || 'NEW',
            amount || 0,
            JSON.stringify(items || []),
            comment,
            docNumber,
            date ? new Date(date) : new Date()
        ]);

        // 2. Insert Items
        if (items && Array.isArray(items)) {
            for (const item of items) {
                await client.query(
                    `INSERT INTO "OrderItem" ("id", "orderId", "productId", "quantity", "sellPrice", "createdAt")
                     VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
                    [id, item.productId, item.quantity, item.price]
                );
            }
        }

        await client.query('COMMIT');

        // Fetch full order with counterparty name
        const fullOrder = await client.query(`
            SELECT o.*, c.name as "counterpartyName"
            FROM "Order" o
            LEFT JOIN "Counterparty" c ON c.id = o."counterpartyId"
            WHERE o.id = $1
        `, [id]);

        res.status(201).json(fullOrder.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Create order error:', error);
        // Debug: Return detailed error to client
        res.status(500).json({ error: 'Failed to create order', details: error instanceof Error ? error.message : String(error) });
    } finally {
        client.release();
    }
});
// 📦 Orders Management
router.get('/orders', async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, search, includeDeleted } = req.query;

        let query = `
				SELECT o.*, c.name as "counterpartyName" 
				FROM "Order" o
				LEFT JOIN "Counterparty" c ON c.id = o."counterpartyId"
				WHERE 1=1
			`;
        const params: any[] = [];
        let paramIndex = 1;

        if (includeDeleted !== 'true') {
            query += ` AND (o."isDeleted" = false OR o."isDeleted" IS NULL)`;
        }

        if (startDate) {
            query += ` AND o."createdAt" >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            const end = new Date(String(endDate));
            end.setHours(23, 59, 59, 999);
            query += ` AND o."createdAt" <= $${paramIndex}`;
            params.push(end.toISOString());
            paramIndex++;
        }

        if (search) {
            query += ` AND (c."name" ILIKE $${paramIndex} OR o."id"::text ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        query += ` ORDER BY o."createdAt" DESC`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ error: 'Failed to get orders' });
    }
});

// GET Single Order
router.get('/orders/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT o.*, c.name as "counterpartyName"
            FROM "Order" o
            LEFT JOIN "Counterparty" c ON c.id = o."counterpartyId"
            WHERE o.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({ error: 'Failed to get order' });
    }
});

// PUT Update Order
router.put('/orders/:id', async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { status, total, amount, counterpartyId, isDeleted, items, comment, date } = req.body;

        await client.query('BEGIN');

        // Update Order header
        const result = await client.query(`
            UPDATE "Order"
            SET status = COALESCE($2, status),
                total = COALESCE($3, total),
                "counterpartyId" = COALESCE($4, "counterpartyId"),
                "isDeleted" = COALESCE($5, "isDeleted"),
                "items" = COALESCE($6, "items"),
                "comment" = COALESCE($7, "comment"),
                "createdAt" = COALESCE($8, "createdAt"),
                "updatedAt" = NOW()
            WHERE id = $1
            RETURNING *
        `, [
            id,
            status,
            amount !== undefined ? amount : total,
            counterpartyId,
            isDeleted,
            items ? JSON.stringify(items) : null,
            comment,
            date
        ]);

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Order not found' });
        }

        // Synchronize OrderItem table if items were provided
        if (items && Array.isArray(items)) {
            // Delete existing items
            await client.query('DELETE FROM "OrderItem" WHERE "orderId" = $1', [id]);

            // Insert new items
            for (const item of items) {
                await client.query(
                    `INSERT INTO "OrderItem" ("id", "orderId", "productId", "quantity", "sellPrice", "createdAt")
                     VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
                    [id, item.productId || item.id, item.quantity, item.price]
                );
            }
        }

        await client.query('COMMIT');

        // Fetch full order with counterparty name to return
        const fullOrder = await client.query(`
            SELECT o.*, c.name as "counterpartyName"
            FROM "Order" o
            LEFT JOIN "Counterparty" c ON c.id = o."counterpartyId"
            WHERE o.id = $1
        `, [id]);

        res.json(fullOrder.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Update order error:', error);
        res.status(500).json({ error: 'Failed to update order' });
    } finally {
        client.release();
    }
});

// DELETE Order (Soft)
router.delete('/orders/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            UPDATE "Order"
            SET "isDeleted" = true, "updatedAt" = NOW()
            WHERE id = $1
            RETURNING id
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.json({ success: true, id });
    } catch (error) {
        console.error('Delete order error:', error);
        res.status(500).json({ error: 'Failed to delete order' });
    }
});

// DELETE Order (Hard)
router.delete('/orders/:id/hard', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        // Check role again? Already checked by adminAuth middleware, so user is admin or manager.
        // Requirement: "Hard delete only for admin". Manager? 
        // adminAuth allows 'admin' or 'manager'.
        // I should strict check 'admin' here if manager shouldn't delete.
        const user = (req as any).user;
        if (user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied: Only admins can perform hard delete' });
        }

        const result = await pool.query(`
            DELETE FROM "Order"
            WHERE id = $1
            RETURNING id
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.json({ success: true, id });
    } catch (error) {
        console.error('Hard delete order error:', error);
        res.status(500).json({ error: 'Failed to delete order' });
    }
});

export default router;
