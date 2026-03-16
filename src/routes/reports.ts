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
                    CASE WHEN gr."date" < ($1::date + interval '1 day') THEN pb."quantityTotal" ELSE 0 END as incoming,
                    COALESCE(
                        (SELECT SUM(rib.quantity) 
                         FROM "RealizationItemBatch" rib 
                         JOIN "RealizationItem" ri ON ri.id = rib."realizationItemId"
                         JOIN "Realization" r ON r.id = ri."realizationId"
                         WHERE rib."productBatchId"::text = pb.id::text AND r."date" < ($1::date + interval '1 day')
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

// GET /api/reports/inventory-movement
router.get('/inventory-movement', async (req: Request, res: Response) => {
    try {
        const { dateFrom, dateTo, warehouseId, sortBy = 'category' } = req.query;

        if (!dateFrom || !dateTo || !warehouseId) {
            return res.status(400).json({ error: 'Missing required parameters: dateFrom, dateTo, warehouseId' });
        }

        const query = `
            WITH BatchIncoming AS (
                SELECT 
                    pb."productId",
                    SUM(CASE WHEN gr."date" < $1::date THEN pb."quantityTotal" ELSE 0 END) as start_in,
                    SUM(CASE WHEN gr."date" >= $1::date AND gr."date" < ($2::date + interval '1 day') THEN pb."quantityTotal" ELSE 0 END) as period_in,
                    JSON_AGG(
                        CASE WHEN gr."date" >= $1::date AND gr."date" < ($2::date + interval '1 day') THEN
                            json_build_object(
                                'id', gr.id,
                                'type', 'GOODS_RECEIPT',
                                'docNumber', gr."docNumber",
                                'date', gr."date",
                                'quantity', pb."quantityTotal"
                            )
                        ELSE NULL END
                    ) FILTER (WHERE gr."date" >= $1::date AND gr."date" < ($2::date + interval '1 day')) as incoming_docs
                FROM "ProductBatch" pb
                JOIN "GoodsReceipt" gr ON gr.id::text = pb."goodsReceiptId"::text
                WHERE gr."warehouseId"::text = $3
                GROUP BY pb."productId"
            ),
            BatchOutgoing AS (
                SELECT 
                    pb."productId",
                    SUM(CASE WHEN r."date" < $1::date THEN rib.quantity ELSE 0 END) as start_out,
                    SUM(CASE WHEN r."date" >= $1::date AND r."date" < ($2::date + interval '1 day') THEN rib.quantity ELSE 0 END) as period_out,
                    JSON_AGG(
                        CASE WHEN r."date" >= $1::date AND r."date" < ($2::date + interval '1 day') THEN
                            json_build_object(
                                'id', r.id,
                                'type', 'REALIZATION',
                                'docNumber', r.number,
                                'date', r."date",
                                'quantity', rib.quantity
                            )
                        ELSE NULL END
                    ) FILTER (WHERE r."date" >= $1::date AND r."date" < ($2::date + interval '1 day')) as outgoing_docs
                FROM "RealizationItemBatch" rib
                JOIN "ProductBatch" pb ON pb.id::text = rib."productBatchId"::text
                JOIN "GoodsReceipt" gr ON gr.id::text = pb."goodsReceiptId"::text
                JOIN "RealizationItem" ri ON ri.id = rib."realizationItemId"
                JOIN "Realization" r ON r.id = ri."realizationId"
                WHERE gr."warehouseId"::text = $3
                GROUP BY pb."productId"
            )
            SELECT 
                p.id as "productId",
                p.name as "productName",
                p.category as "productCategory",
                w.name as "warehouseName",
                COALESCE(bi.start_in, 0) - COALESCE(bo.start_out, 0) as "startBalance",
                COALESCE(bi.period_in, 0) as "incoming",
                COALESCE(bo.period_out, 0) as "outgoing",
                (COALESCE(bi.start_in, 0) - COALESCE(bo.start_out, 0)) + COALESCE(bi.period_in, 0) - COALESCE(bo.period_out, 0) as "endBalance",
                bi.incoming_docs,
                bo.outgoing_docs
            FROM "Product" p
            LEFT JOIN BatchIncoming bi ON p.id::text = bi."productId"::text
            LEFT JOIN BatchOutgoing bo ON p.id::text = bo."productId"::text
            LEFT JOIN "Warehouse" w ON w.id::text = $3
            WHERE p."deleted" = false
        `;

        let orderClause = ` ORDER BY p.category ASC NULLS LAST, p.name ASC`;
        if (sortBy === 'name') {
            orderClause = ` ORDER BY p.name ASC`;
        }

        const fullQuery = query + orderClause;
        const params = [dateFrom, dateTo, warehouseId];

        const result = await pool.query(fullQuery, params);
        
        // Mape the output to parse the JSON arrays and combine them into a single sorted 'details' array
        const formattedResult = result.rows.map(row => {
            const incoming = row.incoming_docs || [];
            const outgoing = row.outgoing_docs || [];
            
            // Filter out nulls that JSON_AGG might produce
            const validIncoming = incoming.filter((doc: any) => doc !== null);
            const validOutgoing = outgoing.filter((doc: any) => doc !== null);

            const details = [...validIncoming, ...validOutgoing].sort((a: any, b: any) => {
                return new Date(a.date).getTime() - new Date(b.date).getTime();
            });

            return {
                productId: row.productId,
                productName: row.productName,
                productCategory: row.productCategory,
                warehouseName: row.warehouseName,
                startBalance: row.startBalance,
                incoming: row.incoming,
                outgoing: row.outgoing,
                endBalance: row.endBalance,
                details
            };
        });

        res.json(formattedResult);
    } catch (error) {
        console.error('Error fetching inventory movement:', error);
        res.status(500).json({ error: 'Failed to fetch inventory movement' });
    }
});

// GET /api/reports/sales/by-client
router.get('/sales/by-client', async (req: Request, res: Response) => {
    try {
        const { dateFrom, dateTo, counterparty } = req.query;
        let params: any[] = [];
        let filters = '';

        if (dateFrom && dateTo) {
            filters += ` AND r.date >= $${params.length + 1}::date AND r.date < ($${params.length + 2}::date + interval '1 day')`;
            params.push(dateFrom, dateTo);
        } else if (dateFrom) {
            filters += ` AND r.date >= $${params.length + 1}::date`;
            params.push(dateFrom);
        } else if (dateTo) {
            filters += ` AND r.date < ($${params.length + 1}::date + interval '1 day')`;
            params.push(dateTo);
        }

        if (counterparty) {
            filters += ` AND c.name ILIKE $${params.length + 1}`;
            params.push(`%${counterparty}%`);
        }

        const query = `
            WITH BaseDocs AS (
                SELECT 
                    "counterpartyId",
                    id,
                    amount as "netAmount",
                    profit as "netProfit"
                FROM "Realization"
                WHERE status = 'POSTED' ${filters.replace(/r\./g, '')}
                
                UNION ALL
                
                SELECT 
                    "counterpartyId",
                    id,
                    -"totalAmount" as "netAmount",
                    profit as "netProfit" -- BuyerReturn profit is already saved as negative
                FROM "BuyerReturn"
                WHERE status = 'POSTED' ${filters.replace(/r\./g, '')}
            )
            SELECT 
                c.id as "clientId",
                c.name as "clientName",
                COUNT(bd.id) as "documentsCount",
                SUM(bd."netAmount") as "totalAmount",
                SUM(bd."netProfit") as "totalProfit"
            FROM BaseDocs bd
            LEFT JOIN "Counterparty" c ON bd."counterpartyId" = c.id
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
            filters += ` AND r.date >= $${params.length + 1}::date AND r.date < ($${params.length + 2}::date + interval '1 day')`;
            params.push(dateFrom, dateTo);
        } else if (dateFrom) {
            filters += ` AND r.date >= $${params.length + 1}::date`;
            params.push(dateFrom);
        } else if (dateTo) {
            filters += ` AND r.date < ($${params.length + 1}::date + interval '1 day')`;
            params.push(dateTo);
        }

        if (counterparty) {
            filters += ` AND c.name ILIKE $${params.length + 1}`;
            params.push(`%${counterparty}%`);
        }

        const query = `
            WITH BaseItems AS (
                SELECT 
                    r."counterpartyId",
                    ri."productId",
                    ri.quantity as "netQty",
                    ri.total as "netAmount",
                    ri.total - COALESCE((
                        SELECT SUM(rib.quantity * rib."enterPrice")
                        FROM "RealizationItemBatch" rib
                        WHERE rib."realizationItemId" = ri.id
                    ), 0) as "netProfit"
                FROM "RealizationItem" ri
                JOIN "Realization" r ON r.id = ri."realizationId"
                WHERE r.status = 'POSTED' ${filters}

                UNION ALL

                SELECT 
                    br."counterpartyId",
                    bri."productId",
                    -bri.quantity as "netQty",
                    -bri.total as "netAmount",
                    -bri.total as "netProfit" -- Simplification: full refund counts against profit identically
                FROM "BuyerReturnItem" bri
                JOIN "BuyerReturn" br ON br.id = bri."buyerReturnId"
                WHERE br.status = 'POSTED' ${filters.replace(/r\./g, 'br.')}
            )
            SELECT 
                p.id as "productId",
                p.name as "productName",
                p.category as "productCategory",
                SUM(bi."netQty") as "totalQuantity",
                SUM(bi."netAmount") as "totalAmount",
                SUM(bi."netProfit") as "totalProfit"
            FROM BaseItems bi
            LEFT JOIN "Product" p ON p.id::text = bi."productId"::text
            LEFT JOIN "Counterparty" c ON bi."counterpartyId" = c.id
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
        const { counterpartyId, groupId, dateFrom, dateTo } = req.query;
        if (!counterpartyId && !groupId) {
            return res.status(400).json({ error: 'counterpartyId or groupId is required' });
        }

        let params: any[] = [];
        let dateFilter = '';
        let startParams: any[] = [];
        let pId = 1;

        // Recursive CTE to resolve counterparty IDs
        let clientIdsFilter = '';
        if (groupId) {
            clientIdsFilter = `
                WITH RECURSIVE GroupHierarchy AS (
                    SELECT id FROM "CounterpartyGroup" WHERE id = $1
                    UNION ALL
                    SELECT cg.id FROM "CounterpartyGroup" cg
                    INNER JOIN GroupHierarchy gh ON cg."parentId" = gh.id
                )
                SELECT id FROM "Counterparty" WHERE "groupId" IN (SELECT id FROM GroupHierarchy)
            `;
            const groupRes = await pool.query(clientIdsFilter, [groupId]);
            const ids = groupRes.rows.map(r => r.id);
            if (ids.length === 0) {
                 return res.json({ ledger: [], endBalance: 0, startBalance: 0 }); // Empty group
            }
            clientIdsFilter = `AND r."counterpartyId" = ANY($${pId}::uuid[])`;
            params.push(ids);
            startParams.push(ids);
            pId++;
        } else {
            clientIdsFilter = `AND r."counterpartyId" = $${pId}`;
            params.push(counterpartyId);
            startParams.push(counterpartyId);
            pId++;
        }
        
        // Date filters for the ledger window
        if (dateFrom && dateTo) {
            dateFilter = ` AND r.date >= $${pId}::date AND r.date < ($${pId+1}::date + interval '1 day')`;
            params.push(dateFrom, dateTo);
            pId += 2;
        } else if (dateFrom) {
            dateFilter = ` AND r.date >= $${pId}::date`;
            params.push(dateFrom);
            pId += 1;
        } else if (dateTo) {
            dateFilter = ` AND r.date < ($${pId}::date + interval '1 day')`;
            params.push(dateTo);
            pId += 1;
        }

        // --- Calculate Opening Balance per counterparty ---
        const startBalances: Record<string, number> = {};
        if (dateFrom) {
            const startQuery = `
                SELECT 
                    r."counterpartyId",
                    COALESCE(SUM(CASE WHEN r.type = 'REALIZATION' THEN r.amount ELSE 0 END), 0) +
                    COALESCE(SUM(CASE WHEN r.type = 'OUTCOME' THEN r.amount ELSE 0 END), 0) -
                    COALESCE(SUM(CASE WHEN r.type = 'BUYER_RETURN' THEN r.amount ELSE 0 END), 0) -
                    COALESCE(SUM(CASE WHEN r.type = 'GOODS_RECEIPT' THEN r.amount ELSE 0 END), 0) -
                    COALESCE(SUM(CASE WHEN r.type = 'INCOME' THEN r.amount ELSE 0 END), 0) as "startBal"
                FROM (
                    SELECT amount, 'REALIZATION' as type, date, "counterpartyId" FROM "Realization" WHERE status = 'POSTED'
                    UNION ALL
                    SELECT "totalAmount" as amount, 'BUYER_RETURN' as type, date, "counterpartyId" FROM "BuyerReturn" WHERE status = 'POSTED'
                    UNION ALL
                    SELECT (SELECT COALESCE(SUM(total), 0) FROM "GoodsReceiptItem" WHERE "goodsReceiptId" = "GoodsReceipt".id) as amount, 'GOODS_RECEIPT' as type, date, "providerId" as "counterpartyId" FROM "GoodsReceipt" WHERE status = 'POSTED'
                    UNION ALL
                    SELECT amount, type, date, "counterpartyId" FROM "CashTransaction" WHERE "isDeleted" = FALSE
                ) r
                WHERE 1=1 ${clientIdsFilter} AND r.date < $${startParams.length + 1}::date
                GROUP BY r."counterpartyId"
            `;
            startParams.push(dateFrom);
            const startRes = await pool.query(startQuery, startParams);
            startRes.rows.forEach(r => {
                startBalances[r.counterpartyId] = parseFloat(r.startBal) || 0;
            });
        }

        // --- Main Ledger Query ---
        const query = `
            WITH Ledger AS (
                SELECT 
                    r.id as "documentId",
                    r.date,
                    'REALIZATION' as "type",
                    r.number as "docNumber",
                    r.amount as "balanceChange",
                    r.amount as "debit",
                    0 as "credit",
                    NULL as "comment",
                    r."counterpartyId"
                FROM "Realization" r
                WHERE r.status = 'POSTED' ${clientIdsFilter} ${dateFilter}

                UNION ALL

                SELECT 
                    r.id as "documentId",
                    r.date,
                    'BUYER_RETURN' as "type",
                    r.number as "docNumber",
                    -r."totalAmount" as "balanceChange",
                    0 as "debit",
                    r."totalAmount" as "credit",
                    r.comment,
                    r."counterpartyId"
                FROM "BuyerReturn" r
                WHERE r.status = 'POSTED' ${clientIdsFilter} ${dateFilter}

                UNION ALL

                SELECT 
                    r.id as "documentId",
                    r.date,
                    'GOODS_RECEIPT' as "type",
                    r."docNumber",
                    -( (SELECT COALESCE(SUM(total), 0) FROM "GoodsReceiptItem" WHERE "goodsReceiptId" = r.id) ) as "balanceChange",
                    0 as "debit",
                    (SELECT COALESCE(SUM(total), 0) FROM "GoodsReceiptItem" WHERE "goodsReceiptId" = r.id) as "credit",
                    r.comment,
                    r."providerId" as "counterpartyId"
                FROM "GoodsReceipt" r
                WHERE r.status = 'POSTED' ${clientIdsFilter.replace('"counterpartyId"', '"providerId"')} ${dateFilter}

                UNION ALL

                SELECT 
                    r.id as "documentId",
                    r.date,
                    r.type as "type", -- 'INCOME' or 'OUTCOME'
                    r.number as "docNumber",
                    CASE WHEN r.type = 'INCOME' THEN -r.amount ELSE r.amount END as "balanceChange",
                    CASE WHEN r.type = 'OUTCOME' THEN r.amount ELSE 0 END as "debit",
                    CASE WHEN r.type = 'INCOME' THEN r.amount ELSE 0 END as "credit",
                    r.comment,
                    r."counterpartyId"
                FROM "CashTransaction" r
                WHERE r."isDeleted" = FALSE ${clientIdsFilter} ${dateFilter}
            )
            SELECT * FROM Ledger ORDER BY date ASC
        `;

        const result = await pool.query(query, params);
        
        // Group rows and compute running balances per counterparty
        const counterpartyIds = new Set<string>();
        Object.keys(startBalances).forEach(id => counterpartyIds.add(id));
        result.rows.forEach(r => counterpartyIds.add(r.counterpartyId));

        const groupedLedger: Record<string, any> = {};
        
        counterpartyIds.forEach(id => {
            const startBal = startBalances[id] || 0;
            groupedLedger[id] = {
                counterpartyId: id,
                startBalance: startBal,
                endBalance: startBal,
                ledger: []
            };
        });

        result.rows.forEach(row => {
            const cpInfo = groupedLedger[row.counterpartyId];
            if (!cpInfo) return;

            const rowChange = parseFloat(row.balanceChange) || 0;
            cpInfo.endBalance += rowChange;

            cpInfo.ledger.push({
                ...row,
                balanceChange: rowChange,
                debit: parseFloat(row.debit) || 0,
                credit: parseFloat(row.credit) || 0,
                runningBalance: cpInfo.endBalance
            });
        });

        res.json({ 
            grouped: Object.values(groupedLedger)
        });
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
        let startParams: any[] = [];
        let filters = '';
        let startFilters = '';

        if (cashboxId) {
            filters += ` AND t."cashboxId" = $${params.length + 1}`;
            startFilters += ` AND "cashboxId" = $${startParams.length + 1}`;
            params.push(cashboxId);
            startParams.push(cashboxId);
        }

        if (dateFrom && dateTo) {
            filters += ` AND t.date >= $${params.length + 1}::date AND t.date < ($${params.length + 2}::date + interval '1 day')`;
            params.push(dateFrom, dateTo);
        } else if (dateFrom) {
            filters += ` AND t.date >= $${params.length + 1}::date`;
            params.push(dateFrom);
        } else if (dateTo) {
            filters += ` AND t.date < ($${params.length + 1}::date + interval '1 day')`;
            params.push(dateTo);
        }

        // --- Calculate Opening Balance ---
        let startBalance = 0;
        if (dateFrom) {
            const startQuery = `
                SELECT 
                    COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) -
                    COALESCE(SUM(CASE WHEN type = 'OUTCOME' THEN amount ELSE 0 END), 0) as "startBal"
                FROM "CashTransaction"
                WHERE "isDeleted" = FALSE ${startFilters} AND date < $${startParams.length + 1}::date
            `;
            startParams.push(dateFrom);
            const startRes = await pool.query(startQuery, startParams);
            startBalance = parseFloat(startRes.rows[0].startBal) || 0;
        }

        // --- Main Ledger Query ---
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
        
        let runningBalance = startBalance;
        let totalIncome = 0;
        let totalOutcome = 0;
        const incomesByCategory: Record<string, { name: string, amount: number }> = {};
        const outcomesByCategory: Record<string, { name: string, amount: number }> = {};

        const ledger = result.rows.map((row: any) => {
            const amt = parseFloat(row.amount);
            const catId = row.categoryId || 'uncategorized';
            const catName = row.categoryName || 'Без статті';

            if(row.type === 'INCOME') {
                runningBalance += amt;
                totalIncome += amt;
                if (!incomesByCategory[catId]) incomesByCategory[catId] = { name: catName, amount: 0 };
                incomesByCategory[catId].amount += amt;
            } else {
                runningBalance -= amt;
                totalOutcome += amt;
                if (!outcomesByCategory[catId]) outcomesByCategory[catId] = { name: catName, amount: 0 };
                outcomesByCategory[catId].amount += amt;
            }
            return {
                ...row,
                runningBalance
            };
        });

        res.json({ 
            ledger, 
            endBalance: runningBalance, 
            startBalance,
            totalIncome, 
            totalOutcome,
            incomesByCategory: Object.values(incomesByCategory).sort((a,b) => b.amount - a.amount),
            outcomesByCategory: Object.values(outcomesByCategory).sort((a,b) => b.amount - a.amount)
        });
    } catch (error) {
        console.error('Error generating cashflow report:', error);
        res.status(500).json({ error: 'Failed to generate cashflow report' });
    }
});

export default router;
