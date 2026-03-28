import pool from '../db.js';
import { InventoryService } from './inventoryService.js';
import { generateDocNumber } from '../utils/docNumberGenerator.js';

export class BuyerReturnService {

    // Create Draft
    static async create(data: any, userId: string) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { date, counterpartyId, warehouseId, comment, items } = data;

            // Generate Number
            const number = await generateDocNumber('BuyerReturn', date ? new Date(date) : new Date(), 'number');

            // 1. Create Header
            const result = await client.query(
                `INSERT INTO "BuyerReturn" 
                ("number", "date", "counterpartyId", "warehouseId", "comment", "status", "createdBy")
                VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6)
                RETURNING *`,
                [number, date, counterpartyId, warehouseId, comment, userId]
            );
            const br = result.rows[0];

            // 2. Create Items
            let totalAmount = 0;
            if (items && items.length > 0) {
                let sortOrder = 0;
                for (const item of items) {
                    const itemTotal = Number(item.quantity) * Number(item.price);
                    totalAmount += itemTotal;
                    
                    await client.query(
                        `INSERT INTO "BuyerReturnItem" 
                        ("buyerReturnId", "productId", "quantity", "price", "total", "sortOrder")
                        VALUES ($1, $2, $3, $4, $5, $6)`,
                        [br.id, item.productId, item.quantity, item.price, itemTotal, sortOrder++]
                    );
                }
            }

            // Update Total Amount on Header
            await client.query(`UPDATE "BuyerReturn" SET "totalAmount" = $1 WHERE id = $2`, [totalAmount, br.id]);

            await client.query('COMMIT');
            return this.getById(br.id);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Update Draft
    static async update(id: string, data: any) {
        const client = await pool.connect();
        try {
            const current = await client.query(`SELECT status FROM "BuyerReturn" WHERE id = $1`, [id]);
            if (current.rows.length === 0) throw new Error('Document not found');
            if (current.rows[0].status === 'POSTED') throw new Error('Cannot edit POSTED document');

            await client.query('BEGIN');
            // Assuming UI might not send number, but just in case we allow updating date, etc.
            const { date, counterpartyId, warehouseId, comment, items } = data;

            // 1. Update Header
            await client.query(
                `UPDATE "BuyerReturn"
                 SET "date"=$1, "counterpartyId"=$2, "warehouseId"=$3, "comment"=$4, "updatedAt"=NOW()
                 WHERE id = $5`,
                [date, counterpartyId, warehouseId, comment, id]
            );

            // 2. Replace Items (Delete all & Insert new)
            await client.query(`DELETE FROM "BuyerReturnItem" WHERE "buyerReturnId" = $1`, [id]);

            let totalAmount = 0;
            if (items && items.length > 0) {
                let sortOrder = 0;
                for (const item of items) {
                    const itemTotal = Number(item.quantity) * Number(item.price);
                    totalAmount += itemTotal;

                    await client.query(
                        `INSERT INTO "BuyerReturnItem" 
                        ("buyerReturnId", "productId", "quantity", "price", "total", "sortOrder")
                        VALUES ($1, $2, $3, $4, $5, $6)`,
                        [id, item.productId, item.quantity, item.price, itemTotal, sortOrder++]
                    );
                }
            }

            // Update Total Amount
            await client.query(`UPDATE "BuyerReturn" SET "totalAmount" = $1 WHERE id = $2`, [totalAmount, id]);

            await client.query('COMMIT');
            return this.getById(id);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Post Document (Affect Stock negatively, profit negatively)
    static async post(id: string) {
        const client = await pool.connect();
        try {
            const docRes = await client.query(`SELECT * FROM "BuyerReturn" WHERE id = $1`, [id]);
            if (docRes.rows.length === 0) throw new Error('Document not found');
            const doc = docRes.rows[0];

            if (doc.status === 'POSTED') throw new Error('Document already posted');

            await client.query('BEGIN');

            const itemsRes = await client.query(`SELECT * FROM "BuyerReturnItem" WHERE "buyerReturnId" = $1 ORDER BY "sortOrder" ASC`, [id]);
            const items = itemsRes.rows;

            // We treat BuyerReturn similar to goods receipts for FIFO, returning stock in at the RETURN price.
            // Profit for this specific action is fully negative equivalent to the total amount refunded.
            // (There is an alternative approach to strictly reverse the exact margin, but usually returning as a new batch
            // at the refund price creates a net-zero if we resold it. For simplicity, we create new ProductBatches.)
            
            let totalProfit = 0;

            for (const item of items) {
                // Retrieve the most recent enterPrice (cost price) for the returned product
                const lastBatchRes = await client.query(
                    `SELECT "enterPrice" FROM "ProductBatch" WHERE "productId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
                    [item.productId]
                );
                const costPrice = lastBatchRes.rows.length > 0 ? Number(lastBatchRes.rows[0].enterPrice) : 0;

                const batch = await InventoryService.addStock(
                    client,
                    item.productId,
                    Number(item.quantity),
                    costPrice, // Refund price historically might be diff, but we re-stock at cost price
                    undefined, // Goods receipt ID
                    doc.date, // The batch will be dated by the return doc
                    id // buyerReturnId
                );

                // Record the relation mapping
                await client.query(
                    `INSERT INTO "BuyerReturnItemBatch" ("buyerReturnItemId", "productBatchId", "quantity")
                     VALUES ($1, $2, $3)`,
                    [item.id, batch.id, item.quantity]
                );

                // Reversing the profit margin that was generated from the initial sale
                // Original profit = (sellPrice - costPrice) * quantity = (item.total) - (costPrice * quantity)
                const itemMargin = (Number(item.price) - costPrice) * Number(item.quantity);
                totalProfit -= itemMargin;
            }

            // Update Status + Profit
            await client.query(
                `UPDATE "BuyerReturn" SET "status" = 'POSTED', "profit" = $1, "updatedAt" = NOW() WHERE id = $2`, 
                [totalProfit, id]
            );

            await client.query('COMMIT');
            return this.getById(id);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Cancel Post (Remove from Stock)
    static async unpost(id: string) {
        const client = await pool.connect();
        try {
            const docRes = await client.query(`SELECT * FROM "BuyerReturn" WHERE id = $1`, [id]);
            if (docRes.rows.length === 0) throw new Error('Document not found');
            const doc = docRes.rows[0];

            if (doc.status !== 'POSTED') throw new Error('Document is not posted');

            await client.query('BEGIN');

            // Find all batches created by this return
            const itemBatchesRes = await client.query(`
                SELECT brib."productBatchId"
                FROM "BuyerReturnItemBatch" brib
                JOIN "BuyerReturnItem" bri ON bri.id = brib."buyerReturnItemId"
                WHERE bri."buyerReturnId" = $1
            `, [id]);

            // Removing batches outright
            for (const row of itemBatchesRes.rows) {
                await client.query(`DELETE FROM "ProductBatch" WHERE id = $1`, [row.productBatchId]);
            }

            // Delete the batch linkage records
            await client.query(`
                DELETE FROM "BuyerReturnItemBatch"
                WHERE "buyerReturnItemId" IN (SELECT id FROM "BuyerReturnItem" WHERE "buyerReturnId" = $1)
            `, [id]);

            // Update Status back to DRAFT
            await client.query(`
                UPDATE "BuyerReturn" 
                SET "status" = 'DRAFT', "profit" = 0, "updatedAt" = NOW() 
                WHERE id = $1
            `, [id]);

            await client.query('COMMIT');
            return this.getById(id);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async getById(id: string) {
        const docRes = await pool.query(`
            SELECT br.*, c.name as "counterpartyName", w.name as "warehouseName", u.email as "authorName"
            FROM "BuyerReturn" br
            LEFT JOIN "Counterparty" c ON c.id = br."counterpartyId"
            LEFT JOIN "Warehouse" w ON w.id = br."warehouseId"
            LEFT JOIN "User" u ON u.id::text = br."createdBy"
            WHERE br.id = $1
        `, [id]);

        if (docRes.rows.length === 0) return null;

        const itemsRes = await pool.query(`
            SELECT bri.*, p.name as "productName"
            FROM "BuyerReturnItem" bri
            LEFT JOIN "Product" p ON p.id = bri."productId"
            WHERE bri."buyerReturnId" = $1
            ORDER BY bri."sortOrder" ASC, bri."createdAt" ASC
        `, [id]);

        return { ...docRes.rows[0], items: itemsRes.rows };
    }

    // List
    static async getAll(filters: any) {
        let query = `
            SELECT br.*, c.name as "counterpartyName", w.name as "warehouseName"
            FROM "BuyerReturn" br
            LEFT JOIN "Counterparty" c ON c.id = br."counterpartyId"
            LEFT JOIN "Warehouse" w ON w.id = br."warehouseId"
            WHERE 1=1
        `;
        const params: any[] = [];
        let pIdx = 1;

        if (filters.startDate) {
            query += ` AND br.date >= $${pIdx++}`;
            params.push(filters.startDate);
        }
        if (filters.endDate) {
            query += ` AND br.date <= $${pIdx++}`;
            params.push(filters.endDate);
        }

        query += ` ORDER BY br.date DESC`;

        const result = await pool.query(query, params);
        return result.rows;
    }

    static async delete(id: string) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const docRes = await client.query('SELECT status FROM "BuyerReturn" WHERE id = $1 FOR UPDATE', [id]);
            if (docRes.rows.length === 0) throw new Error('Document not found');
            
            if (docRes.rows[0].status === 'POSTED') {
                throw new Error('Cannot delete a POSTED document');
            }

            await client.query('DELETE FROM "BuyerReturnItem" WHERE "buyerReturnId" = $1', [id]);
            await client.query('DELETE FROM "BuyerReturn" WHERE id = $1', [id]);
            
            await client.query('COMMIT');
            return { success: true };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}
