import pool from '../db.js';
import { InventoryService } from './inventoryService.js';
import { generateDocNumber } from '../utils/docNumberGenerator.js';

export class GoodsReceiptService {

    // Create Draft
    static async create(data: any, userId: string) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            console.log('Creating GoodsReceipt...', data);
            const { date, warehouseId, providerId, priceTypeId, comment, items } = data;

            // Generate Number
            const number = await generateDocNumber('GoodsReceipt', date ? new Date(date) : new Date(), 'number');

            // 1. Create Header
            const result = await client.query(
                `INSERT INTO "GoodsReceipt" 
                ("number", "date", "warehouseId", "providerId", "comment", "status", "createdBy")
                VALUES ($1, $2, $3, $4, $5, $6, 'SAVED', $7)
                RETURNING *`,
                [number, date, warehouseId, providerId, comment, userId]
            );
            const receipt = result.rows[0];

            // 2. Create Items
            if (items && items.length > 0) {
                for (const item of items) {
                    await client.query(
                        `INSERT INTO "GoodsReceiptItem" 
                        ("goodsReceiptId", "productId", "quantity", "price", "total")
                        VALUES ($1, $2, $3, $4, $5)`,
                        [receipt.id, item.productId, item.quantity, item.price, item.total]
                    );
                }
            }

            await client.query('COMMIT');
            return this.getById(receipt.id);
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
            const current = await client.query(`SELECT status FROM "GoodsReceipt" WHERE id = $1`, [id]);
            if (current.rows.length === 0) throw new Error('Document not found');
            if (current.rows[0].status === 'POSTED') throw new Error('Cannot edit POSTED document');

            await client.query('BEGIN');
            const { number, date, warehouseId, providerId, comment, items } = data;

            // 1. Update Header
            await client.query(
                `UPDATE "GoodsReceipt" 
                SET "number"=$1, "date"=$2, "warehouseId"=$3, "providerId"=$4, "comment"=$6, "updatedAt"=NOW()
                WHERE id = $7`,
                [number, date, warehouseId, providerId, comment, id]
            );

            // 2. Replace Items (Delete all & Insert new)
            await client.query(`DELETE FROM "GoodsReceiptItem" WHERE "goodsReceiptId" = $1`, [id]);

            if (items && items.length > 0) {
                for (const item of items) {
                    await client.query(
                        `INSERT INTO "GoodsReceiptItem" 
                        ("goodsReceiptId", "productId", "quantity", "price", "total")
                        VALUES ($1, $2, $3, $4, $5)`,
                        [id, item.productId, item.quantity, item.price, item.total]
                    );
                }
            }

            await client.query('COMMIT');
            return this.getById(id);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Post Document (Affect Stock)
    static async post(id: string) {
        const client = await pool.connect();
        try {
            const docRes = await client.query(`SELECT * FROM "GoodsReceipt" WHERE id = $1`, [id]);
            if (docRes.rows.length === 0) throw new Error('Document not found');
            const doc = docRes.rows[0];

            if (doc.status === 'POSTED') throw new Error('Document already posted');

            await client.query('BEGIN');

            // 1. Get Items
            const itemsRes = await client.query(`SELECT * FROM "GoodsReceiptItem" WHERE "goodsReceiptId" = $1`, [id]);
            const items = itemsRes.rows;

            // 2. Process Stock
            for (const item of items) {
                // Call InventoryService to add stock
                // We need to pass client to participate in transaction? 
                // InventoryService.addStock helper uses a passed client or creates one?
                // Looking at previous code, addStock takes `client`.
                await InventoryService.addStock(
                    client,
                    item.productId,
                    Number(item.quantity),
                    Number(item.price),
                    id // Link batch to this receipt
                );
            }

            // 3. Update Status
            await client.query(`UPDATE "GoodsReceipt" SET "status" = 'POSTED', "updatedAt" = NOW() WHERE id = $1`, [id]);

            await client.query('COMMIT');
            return this.getById(id);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Get By ID
    static async getById(id: string) {
        const docRes = await pool.query(`
            SELECT gr.*, c.name as "providerName", w.name as "warehouseName", pt.name as "priceTypeName"
            FROM "GoodsReceipt" gr
            LEFT JOIN "Counterparty" c ON c.id = gr."providerId"
            LEFT JOIN "Warehouse" w ON w.id = gr."warehouseId"
            LEFT JOIN "PriceType" pt ON pt.id = gr."priceTypeId"
            WHERE gr.id = $1
        `, [id]);

        if (docRes.rows.length === 0) return null;
        const doc = docRes.rows[0];

        const itemsRes = await pool.query(`
            SELECT gri.*, p.name as "productName"
            FROM "GoodsReceiptItem" gri
            LEFT JOIN "Product" p ON p.id::text = gri."productId" -- Product ID matches by text currently?
            WHERE gri."goodsReceiptId" = $1
        `, [id]);

        return { ...doc, items: itemsRes.rows };
    }

    // List
    static async getAll(filters: any) {
        let query = `
            SELECT gr.*, c.name as "providerName", w.name as "warehouseName"
            FROM "GoodsReceipt" gr
            LEFT JOIN "Counterparty" c ON c.id = gr."providerId"
            LEFT JOIN "Warehouse" w ON w.id = gr."warehouseId"
            WHERE gr."isDeleted" = FALSE
        `;
        const params: any[] = [];
        let pIdx = 1;

        if (filters.startDate) {
            query += ` AND gr.date >= $${pIdx++}`;
            params.push(filters.startDate);
        }
        if (filters.endDate) {
            query += ` AND gr.date <= $${pIdx++}`;
            params.push(filters.endDate);
        }

        query += ` ORDER BY gr.date DESC`;

        const result = await pool.query(query, params);
        return result.rows;
    }
}
