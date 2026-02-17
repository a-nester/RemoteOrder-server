import { Router, Request, Response } from 'express';
import pool from '../db.js';
import { InventoryService } from '../services/inventoryService.js';
import jwt from 'jsonwebtoken';

const router = Router();

// 📱 Endpoint для отримання всіх даних (pull from server)
router.post('/sync/pull', async (req: Request, res: Response) => {
  try {
    const { userId, lastSync } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const lastSyncDate = lastSync ? new Date(lastSync) : new Date(0);

    const result = await pool.query(
      `SELECT * FROM "Order" WHERE "userId" = $1 AND "updatedAt" >= $2`,
      [userId, lastSyncDate]
    );

    res.json({
      success: true,
      data: result.rows,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Sync pull error:', error);
    res.status(500).json({ error: 'Failed to pull data' });
  }
});

import { transformProductForUser, Product, User } from '../utils/productTransformer.js';

// 📦 Endpoint для отримання списку продуктів (для перевірки та синхронізації)
router.get('/products', async (req: Request, res: Response) => {
  try {
    const { lastSync, userId } = req.query; // Assuming userId passed for now, or extract from token
    const lastSyncDate = lastSync ? new Date(String(lastSync)) : new Date(0);
    const adminSecret = req.headers['x-admin-secret'] as string;
    const authHeader = req.headers.authorization;

    let isAdmin = adminSecret === process.env.ADMIN_SECRET;

    if (!isAdmin && authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token) {
        try {
          const secret = process.env.JWT_SECRET || 'your-secret-key';
          const decoded = jwt.verify(token, secret) as any;
          if (decoded.role === 'admin') {
            isAdmin = true;
          }
        } catch (e) {
          // Invalid token
        }
      }
    }

    // Fetch user if userId is provided (Simulated Auth)
    // In real app, extracting User from JWT middleware is better.
    let user: User | undefined;
    if (userId) {
      const userResult = await pool.query('SELECT * FROM "User" WHERE id = $1', [userId]);
      if (userResult.rows.length > 0) {
        user = userResult.rows[0];
      }
    }

    const result = await pool.query(
      'SELECT * FROM "Product" WHERE "updatedAt" > $1 ORDER BY "updatedAt" ASC',
      [lastSyncDate]
    );

    const products = result.rows.map(p => {
      const transformed = transformProductForUser(p as Product, user);
      if (isAdmin) {
        return { ...transformed, prices: p.prices };
      }
      return transformed;
    });

    res.json(products);
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to get products' });
  }
});

// 📱 Endpoint для надсилання змін (push to server)
router.post('/sync/push', async (req: Request, res: Response) => {
  try {
    const { userId, changes } = req.body;

    if (!userId || !Array.isArray(changes)) {
      return res.status(400).json({ error: 'userId and changes array are required' });
    }

    const results = [];

    for (const change of changes) {
      const { id, operation, data } = change;

      try {
        let result;

        if (operation === 'INSERT') {
          // We need a transaction for each order processing to ensure consistency
          const client = await pool.connect();
          try {
            await client.query('BEGIN');

            const fields = ['id', 'userId', 'counterpartyId', 'status', 'total', 'items', 'isDeleted', 'updatedAt'];
            const insertQuery = `
               INSERT INTO "Order" (id, "userId", "counterpartyId", status, total, items, "isDeleted", "updatedAt")
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
               RETURNING *
             `;

            // 1. Insert Order
            result = await client.query(insertQuery, [
              id,
              userId,
              data.counterpartyId || null,
              data.status || 'pending',
              data.total || 0,
              JSON.stringify(data.items || []), // Keep JSON for compatibility/cache
              data.isDeleted ? true : false
            ]);

            // 2. Process Items (Just Save, No Stock Deduction)
            if (data.items && Array.isArray(data.items)) {
              for (const item of data.items) {
                // Create Normalized OrderItem
                await client.query(
                  `INSERT INTO "OrderItem" ("id", "orderId", "productId", "quantity", "sellPrice", "createdAt")
                         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())`,
                  [id, item.id, item.count, item.price]
                );
              }
            }

            await client.query('COMMIT');
          } catch (e) {
            await client.query('ROLLBACK');
            throw e; // rethrow to be caught by outer catch
          } finally {
            client.release();
          }

        } else if (operation === 'UPDATE') {
          // Dynamic UPDATE is tricky with raw SQL without a helper, but workable.
          // For now assuming standard fields update.
          const updateQuery = `
            UPDATE "Order" 
            SET "counterpartyId" = COALESCE($2, "counterpartyId"),
                status = COALESCE($3, status),
                total = COALESCE($4, total),
                items = COALESCE($5, items),
                "isDeleted" = COALESCE($6, "isDeleted"),
                "updatedAt" = NOW()
            WHERE id = $1
            RETURNING *
          `;
          result = await pool.query(updateQuery, [
            id,
            data.counterpartyId,
            data.status,
            data.total,
            data.items ? JSON.stringify(data.items) : null,
            data.isDeleted
          ]);

        } else if (operation === 'DELETE') {
          // Hard Delete - Admin Only
          const userCheck = await pool.query('SELECT role FROM "User" WHERE id = $1', [userId]);
          if (userCheck.rows[0]?.role !== 'admin') {
            throw new Error("Access denied: Only admins can perform hard delete");
          }
          result = await pool.query('DELETE FROM "Order" WHERE id = $1 RETURNING *', [id]);
        }

        // Log the sync
        await pool.query(
          `INSERT INTO "SyncLog" (id, "userId", action, "table", "recordId", data, synced, "createdAt", "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          [
            userId,
            operation,
            'Order',
            id,
            JSON.stringify(change),
            true
          ]
        );

        results.push({ id, success: true, data: result?.rows[0] });
      } catch (err) {
        console.error(err)
        results.push({ id, success: false, error: String(err) });
      }
    }

    res.json({
      success: true,
      results,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Sync push error:', error);
    res.status(500).json({ error: 'Failed to push data' });
  }
});

// 🔄 Full sync endpoint (atomic operation)
router.post('/sync/full', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { userId, lastSync, changes } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    await client.query('BEGIN');

    // Process changes
    const changeResults = [];
    if (changes && Array.isArray(changes)) {
      // Similar logic to push but using 'client' for transaction
      for (const change of changes) {
        const { id, operation, data, table } = change; // Added 'table' to destructure
        try {
          if (table === 'Order') { // Assuming 'table' field exists in 'change' object
            if (operation === 'INSERT') {
              await client.query(
                `INSERT INTO "Order" ("id", "userId", "counterpartyId", "status", "total", "items", "updatedAt")
                         VALUES ($1, $2, $3, $4, $5, $6, NOW())
                         ON CONFLICT ("id") DO UPDATE SET
                            "counterpartyId" = EXCLUDED."counterpartyId",
                            "status" = EXCLUDED."status",
                            "total" = EXCLUDED."total",
                            "items" = EXCLUDED."items",
                            "updatedAt" = NOW()`,
                [id, userId, data.counterpartyId, data.status || 'pending', data.total || 0, JSON.stringify(data.items || [])]
              );
            } else if (operation === 'UPDATE') {
              await client.query(
                `UPDATE "Order" 
                         SET "counterpartyId" = COALESCE($2, "counterpartyId"),
                             status = COALESCE($3, status),
                             total = COALESCE($4, total),
                             items = COALESCE($5, items),
                             "updatedAt" = NOW()
                         WHERE id = $1`,
                [id, data.counterpartyId, data.status, data.total, data.items ? JSON.stringify(data.items) : null]
              );
            } else if (operation === 'DELETE') {
              await client.query('DELETE FROM "Order" WHERE id = $1', [id]);
            }
          } else { // Existing logic for other tables or if 'table' is not 'Order'
            if (operation === 'INSERT') {
              await client.query(
                `INSERT INTO "Order" (id, "userId", status, total, items, "updatedAt")
                         VALUES ($1, $2, $3, $4, $5, NOW())`,
                [id, userId, data.status || 'pending', data.total || 0, JSON.stringify(data.items || [])]
              );
            } else if (operation === 'UPDATE') {
              await client.query(
                `UPDATE "Order" 
                         SET status = COALESCE($2, status),
                             total = COALESCE($3, total),
                             items = COALESCE($4, items),
                             "updatedAt" = NOW()
                         WHERE id = $1`,
                [id, data.status, data.total, data.items ? JSON.stringify(data.items) : null]
              );
            } else if (operation === 'DELETE') {
              await client.query('DELETE FROM "Order" WHERE id = $1', [id]);
            }
          }
          changeResults.push({ id, success: true });
        } catch (err) {
          changeResults.push({ id, success: false, error: String(err) });
        }
      }
    }

    await client.query('COMMIT');

    // Get all updated data
    const lastSyncDate = lastSync ? new Date(lastSync) : new Date(0);
    const ordersResult = await pool.query(
      `SELECT * FROM "Order" WHERE "userId" = $1 AND "updatedAt" >= $2`,
      [userId, lastSyncDate]
    );

    res.json({
      success: true,
      changeResults,
      serverData: ordersResult.rows,
      timestamp: new Date(),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Full sync error:', error);
    res.status(500).json({ error: 'Sync failed' });
  } finally {
    client.release();
  }
});

// 📊 Get sync status
router.get('/sync/status/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `SELECT * FROM "SyncLog" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 10`,
      [String(userId)]
    );

    res.json({
      success: true,
      lastSyncs: result.rows,
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

export default router;
