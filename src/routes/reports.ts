import { Router, Request, Response } from 'express';
import pool from '../db.js';
import { adminAuth } from '../middleware/auth.js';

const router = Router();

// Apply admin auth to all report routes
router.use(adminAuth);

// GET /api/reports/stock-balances
router.get('/stock-balances', async (req: Request, res: Response) => {
    try {
        const dateParam = req.query.date as string;
        const warehouseId = req.query.warehouseId as string;
        const sortBy = req.query.sortBy as string || 'category'; // 'category' or 'name'

        // Default to current date if none provided
        const targetDate = dateParam ? dateParam : new Date().toISOString().split('T')[0];
        const params: any[] = [targetDate];

        let warehouseFilter = '';
        if (warehouseId) {
            warehouseFilter = ` AND gr."warehouseId"::text = $2`;
            params.push(warehouseId);
        }

        const query = `
            WITH BatchBalances AS (
                SELECT 
                    pb.id as batch_id,
                    pb."productId",
                    gr."warehouseId",
                    pb."enterPrice",
                    CASE WHEN pb."createdAt"::date <= $1::date THEN pb."quantityTotal" ELSE 0 END as incoming,
                    COALESCE(
                        (SELECT SUM(oib.quantity) 
                         FROM "OrderItemBatch" oib 
                         WHERE oib."productBatchId"::text = pb.id::text AND oib."createdAt"::date <= $1::date
                        ), 0) as outgoing
                FROM "ProductBatch" pb
                LEFT JOIN "GoodsReceipt" gr ON gr.id::text = pb."goodsReceiptId"::text
                WHERE 1=1 ${warehouseFilter}
            )
            SELECT 
                bb."productId",
                p.name as "productName",
                p.category as "productCategory",
                w.name as "warehouseName",
                SUM(bb.incoming - bb.outgoing) as balance,
                SUM((bb.incoming - bb.outgoing) * bb."enterPrice") as "totalValue"
            FROM BatchBalances bb
            LEFT JOIN "Product" p ON p.id::text = bb."productId"::text
            LEFT JOIN "Warehouse" w ON w.id::text = bb."warehouseId"::text
            GROUP BY bb."productId", p.name, p.category, bb."warehouseId", w.name
            HAVING SUM(bb.incoming - bb.outgoing) != 0
        `;

        let orderClause = ` ORDER BY p.category ASC NULLS LAST, p.name ASC`;
        if (sortBy === 'name') {
            orderClause = ` ORDER BY p.name ASC`;
        }

        const fullQuery = query + orderClause;

        const result = await pool.query(fullQuery, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching stock balances:', error);
        res.status(500).json({ error: 'Failed to fetch stock balances' });
    }
});

export default router;
