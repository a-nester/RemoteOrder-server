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
                        (SELECT SUM(rib.quantity) 
                         FROM "RealizationItemBatch" rib 
                         WHERE rib."productBatchId"::text = pb.id::text AND rib."createdAt"::date <= $1::date
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
// GET /api/reports/sales/by-client
router.get('/sales/by-client', async (req: Request, res: Response) => {
    try {
        const { dateFrom, dateTo, counterparty } = req.query;
        let params: any[] = [];
        let filters = '';

        if (dateFrom && dateTo) {
            filters += ` AND r.date::date >= $${params.length + 1}::date AND r.date::date <= $${params.length + 2}::date`;
            params.push(dateFrom, dateTo);
        } else if (dateFrom) {
            filters += ` AND r.date::date >= $${params.length + 1}::date`;
            params.push(dateFrom);
        } else if (dateTo) {
            filters += ` AND r.date::date <= $${params.length + 1}::date`;
            params.push(dateTo);
        }

        if (counterparty) {
            filters += ` AND c.name ILIKE $${params.length + 1}`;
            params.push(`%${counterparty}%`);
        }

        const query = `
            SELECT 
                c.id as "clientId",
                c.name as "clientName",
                COUNT(DISTINCT r.id) as "documentsCount",
                SUM(r.amount) as "totalAmount",
                SUM(r.profit) as "totalProfit"
            FROM "Realization" r
            LEFT JOIN "Counterparty" c ON r."counterpartyId" = c.id
            WHERE r.status = 'POSTED' ${filters}
            GROUP BY c.id, c.name
            ORDER BY "totalAmount" DESC NULLS LAST
        `;

        const result = await pool.query(query, params);
        console.log('DEBUG sales/by-client SQL:', query);
        console.log('DEBUG sales/by-client params:', params);
        console.log('DEBUG sales/by-client result.rows:', result.rows);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching sales by client:', error);
        res.status(500).json({ error: 'Failed to fetch sales by client' });
    }
});

// GET /api/reports/sales/by-product
router.get('/sales/by-product', async (req: Request, res: Response) => {
    try {
        const { dateFrom, dateTo, counterparty } = req.query;
        let params: any[] = [];
        let filters = '';

        if (dateFrom && dateTo) {
            filters += ` AND r.date::date >= $${params.length + 1}::date AND r.date::date <= $${params.length + 2}::date`;
            params.push(dateFrom, dateTo);
        } else if (dateFrom) {
            filters += ` AND r.date::date >= $${params.length + 1}::date`;
            params.push(dateFrom);
        } else if (dateTo) {
            filters += ` AND r.date::date <= $${params.length + 1}::date`;
            params.push(dateTo);
        }

        if (counterparty) {
            filters += ` AND c.name ILIKE $${params.length + 1}`;
            params.push(`%${counterparty}%`);
        }

        const query = `
            SELECT 
                p.id as "productId",
                p.name as "productName",
                p.category as "productCategory",
                SUM(ri.quantity) as "totalQuantity",
                SUM(ri.total) as "totalAmount",
                SUM(ri.total) - COALESCE(SUM((
                    SELECT SUM(rib.quantity * rib."enterPrice")
                    FROM "RealizationItemBatch" rib
                    WHERE rib."realizationItemId" = ri.id
                )), 0) as "totalProfit"
            FROM "RealizationItem" ri
            JOIN "Realization" r ON r.id = ri."realizationId"
            LEFT JOIN "Product" p ON p.id::text = ri."productId"::text
            LEFT JOIN "Counterparty" c ON r."counterpartyId" = c.id
            WHERE r.status = 'POSTED' ${filters}
            GROUP BY p.id, p.name, p.category
            ORDER BY "totalAmount" DESC NULLS LAST
        `;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching sales by product:', error);
        res.status(500).json({ error: 'Failed to fetch sales by product' });
    }
});

export default router;
