import { Router, Request, Response } from 'express';
import pool from '../db.js';
import { userAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Apply auth to all report routes
router.use(userAuth);

// GET /api/reports/stock-balances
router.get('/stock-balances', async (req: Request, res: Response) => {
    try {
        const dateParam = req.query.date as string;
        let warehouseId = req.query.warehouseId as string;
        const user = (req as AuthRequest).user;
        
        if (user && user.role !== 'admin' && user.warehouseId) {
            warehouseId = user.warehouseId;
        }

        const sortBy = req.query.sortBy as string || 'category'; // 'category' or 'name'

        // Default to current date if none provided
        const targetDate = dateParam ? dateParam : new Date().toISOString().split('T')[0];
        const params: any[] = [targetDate];

        let warehouseFilter = '';
        if (warehouseId) {
            warehouseFilter = ` AND COALESCE(gr."warehouseId", br."warehouseId")::text = $2`;
            params.push(warehouseId);
        }

        const query = `
            WITH BatchBalances AS (
                SELECT 
                    pb.id as batch_id,
                    pb."productId",
                    COALESCE(gr."warehouseId", br."warehouseId") as "warehouseId",
                    pb."enterPrice",
                    CASE WHEN COALESCE(gr."date", br."date") < ($1::date + interval '1 day') THEN pb."quantityTotal" ELSE 0 END as incoming,
                    COALESCE(
                        (SELECT SUM(rib.quantity) 
                         FROM "RealizationItemBatch" rib 
                         JOIN "RealizationItem" ri ON ri.id = rib."realizationItemId"
                         JOIN "Realization" r ON r.id = ri."realizationId"
                         WHERE rib."productBatchId"::text = pb.id::text AND r."date" < ($1::date + interval '1 day')
                        ), 0) +
                    COALESCE(
                        (SELECT SUM(srib.quantity) 
                         FROM "SupplierReturnItemBatch" srib
                         JOIN "SupplierReturnItem" sri ON sri.id = srib."supplierReturnItemId"
                         JOIN "SupplierReturn" sr ON sr.id = sri."supplierReturnId"
                         WHERE srib."productBatchId"::text = pb.id::text AND sr."date" < ($1::date + interval '1 day')
                        ), 0) as outgoing
                FROM "ProductBatch" pb
                LEFT JOIN "GoodsReceipt" gr ON gr.id::text = pb."goodsReceiptId"::text
                LEFT JOIN "BuyerReturn" br ON br.id::text = pb."buyerReturnId"::text
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
        let { dateFrom, dateTo, warehouseId, sortBy = 'category' } = req.query;
        const user = (req as AuthRequest).user;

        if (user && user.role !== 'admin' && user.warehouseId) {
            warehouseId = user.warehouseId as string;
        }

        if (!dateFrom || !dateTo || !warehouseId) {
            return res.status(400).json({ error: 'Missing required parameters: dateFrom, dateTo, warehouseId' });
        }

        const query = `
            WITH BatchIncoming AS (
                SELECT 
                    pb."productId",
                    SUM(CASE WHEN COALESCE(gr."date", br."date") < $1::date THEN pb."quantityTotal" ELSE 0 END) as start_in,
                    SUM(CASE WHEN COALESCE(gr."date", br."date") >= $1::date AND COALESCE(gr."date", br."date") < ($2::date + interval '1 day') THEN pb."quantityTotal" ELSE 0 END) as period_in,
                    JSON_AGG(
                        CASE WHEN COALESCE(gr."date", br."date") >= $1::date AND COALESCE(gr."date", br."date") < ($2::date + interval '1 day') THEN
                            json_build_object(
                                'id', COALESCE(gr.id, br.id),
                                'type', CASE WHEN gr.id IS NOT NULL THEN 'GOODS_RECEIPT' ELSE 'BUYER_RETURN' END,
                                'docNumber', COALESCE(gr."docNumber", br."number"),
                                'date', COALESCE(gr."date", br."date"),
                                'quantity', pb."quantityTotal"
                            )
                        ELSE NULL END
                    ) FILTER (WHERE COALESCE(gr."date", br."date") >= $1::date AND COALESCE(gr."date", br."date") < ($2::date + interval '1 day')) as incoming_docs
                FROM "ProductBatch" pb
                LEFT JOIN "GoodsReceipt" gr ON gr.id::text = pb."goodsReceiptId"::text
                LEFT JOIN "BuyerReturn" br ON br.id::text = pb."buyerReturnId"::text
                WHERE COALESCE(gr."warehouseId", br."warehouseId")::text = $3
                GROUP BY pb."productId"
            ),
            OutgoingEvents AS (
                SELECT
                    pb."productId",
                    r."date" as event_date,
                    rib.quantity,
                    r.id as doc_id,
                    'REALIZATION' as doc_type,
                    r.number as doc_number
                FROM "RealizationItemBatch" rib
                JOIN "ProductBatch" pb ON pb.id::text = rib."productBatchId"::text
                LEFT JOIN "GoodsReceipt" gr ON gr.id::text = pb."goodsReceiptId"::text
                LEFT JOIN "BuyerReturn" br ON br.id::text = pb."buyerReturnId"::text
                JOIN "RealizationItem" ri ON ri.id = rib."realizationItemId"
                JOIN "Realization" r ON r.id = ri."realizationId"
                WHERE COALESCE(gr."warehouseId", br."warehouseId")::text = $3
                
                UNION ALL
                
                SELECT
                    pb."productId",
                    sr."date" as event_date,
                    srib.quantity,
                    sr.id as doc_id,
                    'SUPPLIER_RETURN' as doc_type,
                    sr."number" as doc_number
                FROM "SupplierReturnItemBatch" srib
                JOIN "ProductBatch" pb ON pb.id::text = srib."productBatchId"::text
                LEFT JOIN "GoodsReceipt" gr ON gr.id::text = pb."goodsReceiptId"::text
                LEFT JOIN "BuyerReturn" br ON br.id::text = pb."buyerReturnId"::text
                JOIN "SupplierReturnItem" sri ON sri.id = srib."supplierReturnItemId"
                JOIN "SupplierReturn" sr ON sr.id = sri."supplierReturnId"
                WHERE COALESCE(gr."warehouseId", br."warehouseId")::text = $3
            ),
            BatchOutgoing AS (
                SELECT 
                    "productId",
                    SUM(CASE WHEN event_date < $1::date THEN quantity ELSE 0 END) as start_out,
                    SUM(CASE WHEN event_date >= $1::date AND event_date < ($2::date + interval '1 day') THEN quantity ELSE 0 END) as period_out,
                    JSON_AGG(
                        CASE WHEN event_date >= $1::date AND event_date < ($2::date + interval '1 day') THEN
                            json_build_object(
                                'id', doc_id,
                                'type', doc_type,
                                'docNumber', doc_number,
                                'date', event_date,
                                'quantity', quantity
                            )
                        ELSE NULL END
                    ) FILTER (WHERE event_date >= $1::date AND event_date < ($2::date + interval '1 day')) as outgoing_docs
                FROM OutgoingEvents
                GROUP BY "productId"
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
        const { dateFrom, dateTo, counterparty, groupBySalesType, salesType } = req.query;
        const user = (req as AuthRequest).user;
        let params: any[] = [];
        let rFilters = '';
        let brFilters = '';

        if (user && user.role !== 'admin' && user.warehouseId) {
            rFilters += ` AND r."warehouseId" = $${params.length + 1}`;
            brFilters += ` AND br."warehouseId" = $${params.length + 1}`;
            params.push(user.warehouseId);
        }

        if (dateFrom && dateTo) {
            rFilters += ` AND r.date >= $${params.length + 1}::date AND r.date < ($${params.length + 2}::date + interval '1 day')`;
            brFilters += ` AND br.date >= $${params.length + 1}::date AND br.date < ($${params.length + 2}::date + interval '1 day')`;
            params.push(dateFrom, dateTo);
        } else if (dateFrom) {
            rFilters += ` AND r.date >= $${params.length + 1}::date`;
            brFilters += ` AND br.date >= $${params.length + 1}::date`;
            params.push(dateFrom);
        } else if (dateTo) {
            rFilters += ` AND r.date < ($${params.length + 1}::date + interval '1 day')`;
            brFilters += ` AND br.date < ($${params.length + 1}::date + interval '1 day')`;
            params.push(dateTo);
        }

        if (counterparty) {
            rFilters += ` AND c.name ILIKE $${params.length + 1}`;
            brFilters += ` AND c.name ILIKE $${params.length + 1}`;
            params.push(`%${counterparty}%`);
        }

        if (salesType) {
            rFilters += ` AND r."salesType" = $${params.length + 1}`;
            brFilters += ` AND FALSE`; // Exclude returns if specific salesType is requested
            params.push(salesType);
        }

        const query = `
            WITH BaseDocs AS (
                SELECT 
                    r."counterpartyId",
                    r.id,
                    r.amount as "netAmount",
                    r.profit as "netProfit",
                    ${groupBySalesType === 'true' ? 'r."salesType"' : "'' as \"salesType\""}
                FROM "Realization" r
                LEFT JOIN "Counterparty" c ON r."counterpartyId" = c.id
                WHERE r.status = 'POSTED' ${rFilters}
                
                UNION ALL
                
                SELECT 
                    br."counterpartyId",
                    br.id,
                    -br."totalAmount" as "netAmount",
                    br.profit as "netProfit", -- BuyerReturn profit is already saved as negative
                    '' as "salesType"
                FROM "BuyerReturn" br
                LEFT JOIN "Counterparty" c ON br."counterpartyId" = c.id
                WHERE br.status = 'POSTED' ${brFilters}
            )
            SELECT 
                c.id as "clientId",
                c.name as "clientName",
                ${groupBySalesType === 'true' ? 'bd."salesType",' : ''}
                COUNT(bd.id) as "documentsCount",
                SUM(bd."netAmount") as "totalAmount",
                SUM(bd."netProfit") as "totalProfit"
            FROM BaseDocs bd
            LEFT JOIN "Counterparty" c ON bd."counterpartyId" = c.id
            GROUP BY c.id, c.name ${groupBySalesType === 'true' ? ', bd."salesType"' : ''}
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

// GET /api/reports/sales/by-client/details
router.get('/sales/by-client/details', async (req: Request, res: Response) => {
    try {
        const { dateFrom, dateTo, clientId, salesType } = req.query;
        if (!clientId) return res.status(400).json({ error: 'clientId is required' });

        const user = (req as AuthRequest).user;
        let params: any[] = [];
        let rFilters = '';
        let brFilters = '';

        if (user && user.role !== 'admin' && user.warehouseId) {
            rFilters += ` AND r."warehouseId" = $${params.length + 1}`;
            brFilters += ` AND br."warehouseId" = $${params.length + 1}`;
            params.push(user.warehouseId);
        }

        rFilters += ` AND r."counterpartyId" = $${params.length + 1}`;
        brFilters += ` AND br."counterpartyId" = $${params.length + 1}`;
        params.push(clientId);

        if (dateFrom && dateTo) {
            rFilters += ` AND r.date >= $${params.length + 1}::date AND r.date < ($${params.length + 2}::date + interval '1 day')`;
            brFilters += ` AND br.date >= $${params.length + 1}::date AND br.date < ($${params.length + 2}::date + interval '1 day')`;
            params.push(dateFrom, dateTo);
        } else if (dateFrom) {
            rFilters += ` AND r.date >= $${params.length + 1}::date`;
            brFilters += ` AND br.date >= $${params.length + 1}::date`;
            params.push(dateFrom);
        } else if (dateTo) {
            rFilters += ` AND r.date < ($${params.length + 1}::date + interval '1 day')`;
            brFilters += ` AND br.date < ($${params.length + 1}::date + interval '1 day')`;
            params.push(dateTo);
        }

        if (salesType) {
            rFilters += ` AND r."salesType" = $${params.length + 1}`;
            brFilters += ` AND FALSE`; // returns do not match salesType directly unless tracked
            params.push(salesType);
        }

        const query = `
            WITH BaseItems AS (
                SELECT 
                    ri."productId"::text as "productId",
                    ri.quantity as "netQty",
                    ri.total as "netAmount",
                    COALESCE((
                        SELECT SUM(rib.quantity * rib."enterPrice")
                        FROM "RealizationItemBatch" rib
                        WHERE rib."realizationItemId" = ri.id
                    ), 0) as "netPurchaseCost"
                FROM "Realization" r
                JOIN "RealizationItem" ri ON r.id = ri."realizationId"
                WHERE r.status = 'POSTED' ${rFilters}
                
                UNION ALL
                
                SELECT 
                    bri."productId"::text as "productId",
                    -bri.quantity as "netQty",
                    -bri.total as "netAmount",
                    -COALESCE((
                        SELECT SUM(brb.quantity * pb."enterPrice")
                        FROM "BuyerReturnItemBatch" brb
                        JOIN "ProductBatch" pb ON pb.id = brb."productBatchId"
                        WHERE brb."buyerReturnItemId" = bri.id
                    ), 0) as "netPurchaseCost"
                FROM "BuyerReturn" br
                JOIN "BuyerReturnItem" bri ON br.id = bri."buyerReturnId"
                WHERE br.status = 'POSTED' ${brFilters}
            )
            SELECT 
                p.name as "productName",
                p.unit,
                SUM(bi."netQty") as "quantity",
                SUM(bi."netAmount") as "amount",
                SUM(bi."netAmount" - bi."netPurchaseCost") as "profit",
                CASE WHEN SUM(bi."netQty") > 0 THEN SUM(bi."netAmount") / SUM(bi."netQty") ELSE 0 END as "averagePrice"
            FROM BaseItems bi
            LEFT JOIN "Product" p ON bi."productId" = p.id::text
            GROUP BY p.name, p.unit
            ORDER BY "quantity" DESC NULLS LAST
        `;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching sales by client details:', error);
        res.status(500).json({ error: 'Failed to fetch sales by client details' });
    }
});

// GET /api/reports/sales/by-product
router.get('/sales/by-product', async (req: Request, res: Response) => {
    try {
        const { dateFrom, dateTo, counterparty, groupBySalesType, salesType } = req.query;
        const user = (req as AuthRequest).user;
        let params: any[] = [];
        let rFilters = '';
        let brFilters = '';

        if (user && user.role !== 'admin' && user.warehouseId) {
            rFilters += ` AND r."warehouseId" = $${params.length + 1}`;
            brFilters += ` AND br."warehouseId" = $${params.length + 1}`;
            params.push(user.warehouseId);
        }

        if (dateFrom && dateTo) {
            rFilters += ` AND r.date >= $${params.length + 1}::date AND r.date < ($${params.length + 2}::date + interval '1 day')`;
            brFilters += ` AND br.date >= $${params.length + 1}::date AND br.date < ($${params.length + 2}::date + interval '1 day')`;
            params.push(dateFrom, dateTo);
        } else if (dateFrom) {
            rFilters += ` AND r.date >= $${params.length + 1}::date`;
            brFilters += ` AND br.date >= $${params.length + 1}::date`;
            params.push(dateFrom);
        } else if (dateTo) {
            rFilters += ` AND r.date < ($${params.length + 1}::date + interval '1 day')`;
            brFilters += ` AND br.date < ($${params.length + 1}::date + interval '1 day')`;
            params.push(dateTo);
        }

        if (counterparty) {
            rFilters += ` AND c.name ILIKE $${params.length + 1}`;
            brFilters += ` AND c.name ILIKE $${params.length + 1}`;
            params.push(`%${counterparty}%`);
        }

        if (salesType) {
            rFilters += ` AND r."salesType" = $${params.length + 1}`;
            brFilters += ` AND FALSE`; // Exclude returns if specific salesType is requested
            params.push(salesType);
        }

        const query = `
            WITH BaseItems AS (
                SELECT 
                    r."counterpartyId"::text as "counterpartyId",
                    ri."productId"::text as "productId",
                    ri.quantity as "netQty",
                    ri.total as "netAmount",
                    COALESCE((
                        SELECT SUM(rib.quantity * rib."enterPrice")
                        FROM "RealizationItemBatch" rib
                        WHERE rib."realizationItemId" = ri.id
                    ), 0) as "netPurchaseCost",
                    ri.total - COALESCE((
                        SELECT SUM(rib.quantity * rib."enterPrice")
                        FROM "RealizationItemBatch" rib
                        WHERE rib."realizationItemId" = ri.id
                    ), 0) as "netProfit",
                    ${groupBySalesType === 'true' ? 'r."salesType"' : "'' as \"salesType\""}
                FROM "RealizationItem" ri
                JOIN "Realization" r ON r.id = ri."realizationId"
                LEFT JOIN "Counterparty" c ON r."counterpartyId" = c.id
                WHERE r.status = 'POSTED' ${rFilters}

                UNION ALL

                SELECT 
                    br."counterpartyId"::text as "counterpartyId",
                    bri."productId"::text as "productId",
                    -bri.quantity as "netQty",
                    -bri.total as "netAmount",
                    -(COALESCE((
                        SELECT pb."enterPrice"
                        FROM "BuyerReturnItemBatch" brib
                        JOIN "ProductBatch" pb ON pb.id = brib."productBatchId"
                        WHERE brib."buyerReturnItemId" = bri.id
                        LIMIT 1
                    ), 0) * bri.quantity) as "netPurchaseCost",
                    (COALESCE((
                        SELECT pb."enterPrice"
                        FROM "BuyerReturnItemBatch" brib
                        JOIN "ProductBatch" pb ON pb.id = brib."productBatchId"
                        WHERE brib."buyerReturnItemId" = bri.id
                        LIMIT 1
                    ), 0) * bri.quantity) - bri.total as "netProfit",
                    '' as "salesType"
                FROM "BuyerReturnItem" bri
                JOIN "BuyerReturn" br ON br.id = bri."buyerReturnId"
                LEFT JOIN "Counterparty" c ON br."counterpartyId" = c.id
                WHERE br.status = 'POSTED' ${brFilters}
            )
            SELECT 
                p.id as "productId",
                p.name as "productName",
                p.category as "productCategory",
                ${groupBySalesType === 'true' ? 'bi."salesType",' : ''}
                SUM(bi."netQty") as "totalQuantity",
                SUM(bi."netAmount") as "totalAmount",
                SUM(bi."netPurchaseCost") as "totalPurchaseCost",
                SUM(bi."netProfit") as "totalProfit"
            FROM BaseItems bi
            LEFT JOIN "Product" p ON p.id::text = bi."productId"
            GROUP BY p.id, p.name, p.category ${groupBySalesType === 'true' ? ', bi."salesType"' : ''}
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
                    COALESCE(SUM(CASE WHEN r.type = 'GOODS_RECEIPT' THEN r.amount ELSE 0 END), 0) +
                    COALESCE(SUM(CASE WHEN r.type = 'SUPPLIER_RETURN' THEN r.amount ELSE 0 END), 0) -
                    COALESCE(SUM(CASE WHEN r.type = 'INCOME' THEN r.amount ELSE 0 END), 0) as "startBal"
                FROM (
                    SELECT amount, 'REALIZATION' as type, date, "counterpartyId" FROM "Realization" WHERE status = 'POSTED'
                    UNION ALL
                    SELECT "totalAmount" as amount, 'BUYER_RETURN' as type, date, "counterpartyId" FROM "BuyerReturn" WHERE status = 'POSTED'
                    UNION ALL
                    SELECT (SELECT COALESCE(SUM(total), 0) FROM "GoodsReceiptItem" WHERE "goodsReceiptId" = "GoodsReceipt".id) as amount, 'GOODS_RECEIPT' as type, date, "providerId" as "counterpartyId" FROM "GoodsReceipt" WHERE status = 'POSTED'
                    UNION ALL
                    SELECT "totalAmount" as amount, 'SUPPLIER_RETURN' as type, date, "supplierId" as "counterpartyId" FROM "SupplierReturn" WHERE status = 'POSTED'
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
                    'SUPPLIER_RETURN' as "type",
                    r.number as "docNumber",
                    r."totalAmount" as "balanceChange",
                    r."totalAmount" as "debit",
                    0 as "credit",
                    r.comment,
                    r."supplierId" as "counterpartyId"
                FROM "SupplierReturn" r
                WHERE r.status = 'POSTED' ${clientIdsFilter.replace('"counterpartyId"', '"supplierId"')} ${dateFilter}

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
