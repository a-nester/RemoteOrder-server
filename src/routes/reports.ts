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

// ==========================================
// FINANCE REPORTS
// ==========================================

// GET /api/reports/reconciliation (Акт звірки)
router.get('/reconciliation', async (req: Request, res: Response) => {
    try {
        const { counterpartyId, dateFrom, dateTo } = req.query;
        if (!counterpartyId) {
            return res.status(400).json({ error: 'counterpartyId is required' });
        }

        let params: any[] = [counterpartyId];
        let dateFilter = '';
        
        if (dateFrom && dateTo) {
            dateFilter = ` AND date::date >= $2::date AND date::date <= $3::date`;
            params.push(dateFrom, dateTo);
        } else if (dateFrom) {
            dateFilter = ` AND date::date >= $2::date`;
            params.push(dateFrom);
        } else if (dateTo) {
            dateFilter = ` AND date::date <= $2::date`;
            params.push(dateTo);
        }

        // Ledger: 
        // Realization (We sold) -> Client debt INCREASES (+)
        // GoodsReceipt (We bought) -> Supplier debt INCREASES (-) [From our perspective, we owe them, so our debt to them is positive, their debt to us is negative. Let's normalize to "Counterparty Balance", where >0 means they owe us, <0 means we owe them]
        // - Realization: +amount
        // - CashTransaction (INCOME): -amount (they paid us, debt drops)
        // - GoodsReceipt: -total (we bought, they owe us less / we owe them more)
        // - CashTransaction (OUTCOME): +amount (we paid them, our debt drops / their balance goes up)

        const query = `
            WITH Ledger AS (
                SELECT 
                    id as "documentId",
                    date,
                    'REALIZATION' as "type",
                    number as "docNumber",
                    amount as "balanceChange",
                    amount as "debit",
                    0 as "credit",
                    NULL as "comment"
                FROM "Realization"
                WHERE "counterpartyId" = $1 AND status = 'POSTED' ${dateFilter}

                UNION ALL

                SELECT 
                    id as "documentId",
                    date,
                    'GOODS_RECEIPT' as "type",
                    "docNumber",
                    -(total) as "balanceChange",
                    0 as "debit",
                    total as "credit",
                    comment
                FROM "GoodsReceipt"
                WHERE "counterpartyId" = $1 AND status = 'POSTED' ${dateFilter}

                UNION ALL

                SELECT 
                    id as "documentId",
                    date,
                    type as "type", -- 'INCOME' or 'OUTCOME'
                    number as "docNumber",
                    CASE WHEN type = 'INCOME' THEN -amount ELSE amount END as "balanceChange",
                    CASE WHEN type = 'OUTCOME' THEN amount ELSE 0 END as "debit",
                    CASE WHEN type = 'INCOME' THEN amount ELSE 0 END as "credit",
                    comment
                FROM "CashTransaction"
                WHERE "counterpartyId" = $1 AND "isDeleted" = FALSE ${dateFilter}
            )
            SELECT * FROM Ledger ORDER BY date ASC
        `;

        const result = await pool.query(query, params);
        
        let runningBalance = 0;
        const ledger = result.rows.map(row => {
            runningBalance += parseFloat(row.balanceChange);
            return {
                ...row,
                runningBalance
            };
        });

        res.json({ ledger, endBalance: runningBalance });
    } catch (error) {
        console.error('Error generating reconciliation report:', error);
        res.status(500).json({ error: 'Failed to generate reconciliation report' });
    }
});

// GET /api/reports/cashflow (Рух коштів)
router.get('/cashflow', async (req: Request, res: Response) => {
    try {
        const { cashboxId, dateFrom, dateTo } = req.query;
        let params: any[] = [];
        let filters = '';

        if (cashboxId) {
            filters += ` AND t."cashboxId" = $${params.length + 1}`;
            params.push(cashboxId);
        }

        if (dateFrom && dateTo) {
            filters += ` AND t.date::date >= $${params.length + 1}::date AND t.date::date <= $${params.length + 2}::date`;
            params.push(dateFrom, dateTo);
        } else if (dateFrom) {
            filters += ` AND t.date::date >= $${params.length + 1}::date`;
            params.push(dateFrom);
        } else if (dateTo) {
            filters += ` AND t.date::date <= $${params.length + 1}::date`;
            params.push(dateTo);
        }

        const query = `
            SELECT 
                t.*, 
                c.name as "cashboxName", 
                cat.name as "categoryName", 
                cp.name as "counterpartyName"
            FROM "CashTransaction" t
            JOIN "Cashbox" c ON t."cashboxId" = c.id
            LEFT JOIN "TransactionCategory" cat ON t."categoryId" = cat.id
            LEFT JOIN "Counterparty" cp ON t."counterpartyId" = cp.id
            WHERE t."isDeleted" = FALSE ${filters}
            ORDER BY t.date ASC
        `;

        const result = await pool.query(query, params);
        
        let runningBalance = 0;
        let totalIncome = 0;
        let totalOutcome = 0;

        const ledger = result.rows.map((row: any) => {
            const amt = parseFloat(row.amount);
            if(row.type === 'INCOME') {
                runningBalance += amt;
                totalIncome += amt;
            } else {
                runningBalance -= amt;
                totalOutcome += amt;
            }
            return {
                ...row,
                runningBalance
            };
        });

        res.json({ ledger, endBalance: runningBalance, totalIncome, totalOutcome });
    } catch (error) {
        console.error('Error generating cashflow report:', error);
        res.status(500).json({ error: 'Failed to generate cashflow report' });
    }
});

export default router;
