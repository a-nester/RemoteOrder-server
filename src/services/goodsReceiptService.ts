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
            const { date, warehouseId, providerId, comment, items } = data;

            // Generate Number
            const number = await generateDocNumber('GoodsReceipt', date ? new Date(date) : new Date(), 'number');

            // 1. Create Header
            const result = await client.query(
                `INSERT INTO "GoodsReceipt" 
                ("number", "date", "warehouseId", "providerId", "comment", "status", "createdBy")
                VALUES ($1, $2, $3, $4, $5, 'SAVED', $6)
                RETURNING *`,
                [number, date, warehouseId, providerId, comment, userId]
            );
            const receipt = result.rows[0];

            // 2. Create Items
            if (items && items.length > 0) {
                let sortOrder = 0;
                for (const item of items) {
                    await client.query(
                        `INSERT INTO "GoodsReceiptItem" 
                        ("goodsReceiptId", "productId", "quantity", "price", "total", "sortOrder")
                        VALUES ($1, $2, $3, $4, $5, $6)`,
                        [receipt.id, item.productId, item.quantity, item.price, item.total, sortOrder++]
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
            const isPosted = current.rows[0].status === 'POSTED';
            await client.query('BEGIN');
            const { number, date, warehouseId, providerId, comment, items } = data;

            // 1. Update Header
            await client.query(
                `UPDATE "GoodsReceipt"
   SET "number"=$1, "date"=$2, "warehouseId"=$3, "providerId"=$4, "comment"=$5, "updatedAt"=NOW()
   WHERE id = $6`,
                [number, date, warehouseId, providerId, comment, id]
            );

            if (isPosted) {
                // Fetch existing batches
                const oldBatchesRes = await client.query(`SELECT id, "productId", "quantityTotal", "quantityLeft", "enterPrice" FROM "ProductBatch" WHERE "goodsReceiptId" = $1 FOR UPDATE`, [id]);
                const oldBatchesMap = new Map();
                for (const b of oldBatchesRes.rows) {
                    if (!oldBatchesMap.has(b.productId)) {
                        oldBatchesMap.set(b.productId, b);
                    } else {
                        // Consolidate if there were multiple batches for the same product
                        const existing = oldBatchesMap.get(b.productId);
                        existing.quantityTotal = Number(existing.quantityTotal) + Number(b.quantityTotal);
                        existing.quantityLeft = Number(existing.quantityLeft) + Number(b.quantityLeft);
                        existing._ids = existing._ids || [existing.id];
                        existing._ids.push(b.id);
                    }
                }

                // Check deleted or updated items
                const incomingItemMap = new Map();
                for (const item of (items || [])) {
                    if (!incomingItemMap.has(item.productId)) {
                        incomingItemMap.set(item.productId, { ...item, quantity: Number(item.quantity) });
                    } else {
                        incomingItemMap.get(item.productId).quantity += Number(item.quantity);
                    }
                }

                for (const [productId, oldB] of Array.from(oldBatchesMap.entries())) {
                    const sold = Number(oldB.quantityTotal) - Number(oldB.quantityLeft);
                    const incomingItemsForProduct = incomingItemMap.get(productId);
                    const newTotal = incomingItemsForProduct ? Number(incomingItemsForProduct.quantity) : 0;
                    
                    if (newTotal < sold) {
                        throw new Error(`Проданий товар неможливо видалити чи зменшити нижче вже проданого (${sold}). Впишіть кількість >= ${sold}.`);
                    }

                    if (newTotal === 0 && sold === 0) {
                        // Unsold item deleted
                        await client.query(`DELETE FROM "ProductBatch" WHERE "goodsReceiptId" = $1 AND "productId" = $2`, [id, productId]);
                    } else if (newTotal > 0) {
                        // Product exists, update it
                        const newLeft = newTotal - sold;
                        const newPrice = Number(incomingItemsForProduct.price);
                        
                        // We strictly update the first batch to hold all new quantities, and dummy the rest if any
                        const ids = oldB._ids || [oldB.id];
                        await client.query(`UPDATE "ProductBatch" SET "quantityTotal" = $1, "quantityLeft" = $2, "enterPrice" = $3, "updatedAt" = NOW() WHERE id = $4`, [newTotal, newLeft, newPrice, ids[0]]);
                        if (ids.length > 1) {
                             for (let i = 1; i < ids.length; i++) {
                                 await client.query(`UPDATE "ProductBatch" SET "quantityTotal" = 0, "quantityLeft" = 0, "updatedAt" = NOW() WHERE id = $1`, [ids[i]]);
                             }
                        }
                    }
                }

                // Append any purely NEW products to ProductBatch
                for (const [productId, incomingItem] of Array.from(incomingItemMap.entries())) {
                    if (!oldBatchesMap.has(productId)) {
                        await InventoryService.addStock(
                            client,
                            productId,
                            Number(incomingItem.quantity),
                            Number(incomingItem.price),
                            id,
                            new Date(date)
                        );
                    }
                }
            }

            // Replace Items in DB for record
            await client.query(`DELETE FROM "GoodsReceiptItem" WHERE "goodsReceiptId" = $1`, [id]);

            if (items && items.length > 0) {
                let sortOrder = 0;
                for (const item of items) {
                    await client.query(
                        `INSERT INTO "GoodsReceiptItem" 
                        ("goodsReceiptId", "productId", "quantity", "price", "total", "sortOrder")
                        VALUES ($1, $2, $3, $4, $5, $6)`,
                        [id, item.productId, item.quantity, item.price, item.total, sortOrder++]
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
    static async post(id: string, txClient?: any) {
        const client = txClient || await pool.connect();
        try {
            const docRes = await client.query(`SELECT * FROM "GoodsReceipt" WHERE id = $1`, [id]);
            if (docRes.rows.length === 0) throw new Error('Document not found');
            const doc = docRes.rows[0];

            if (doc.status === 'POSTED') throw new Error('Document already posted');

            if (!txClient) await client.query('BEGIN');

            // 1. Get Items
            const itemsRes = await client.query(`SELECT * FROM "GoodsReceiptItem" WHERE "goodsReceiptId" = $1 ORDER BY "sortOrder" ASC, "createdAt" ASC`, [id]);
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
                    id, // Link batch to this receipt
                    doc.date // Explicitly set batch creation date to the document's date
                );
            }

            // 3. Update Status
            await client.query(`UPDATE "GoodsReceipt" SET "status" = 'POSTED', "updatedAt" = NOW() WHERE id = $1`, [id]);

            if (!txClient) await client.query('COMMIT');
            if (txClient) return { id, status: 'POSTED' };
            return this.getById(id);
        } catch (error) {
            if (!txClient) await client.query('ROLLBACK');
            throw error;
        } finally {
            if (!txClient) client.release();
        }
    }

    // Cancel Post (Remove from Stock)
    static async unpost(id: string, txClient?: any) {
        const client = txClient || await pool.connect();
        try {
            const docRes = await client.query(`SELECT * FROM "GoodsReceipt" WHERE id = $1`, [id]);
            if (docRes.rows.length === 0) throw new Error('Document not found');
            const doc = docRes.rows[0];

            if (doc.status !== 'POSTED') throw new Error('Document is not posted');

            if (!txClient) await client.query('BEGIN');

            // 0. Check if ANY batches have been sold
            const batchesCheck = await client.query(`SELECT "productId", "quantityTotal", "quantityLeft" FROM "ProductBatch" WHERE "goodsReceiptId" = $1 AND "quantityLeft" < "quantityTotal"`, [id]);
            if (batchesCheck.rows.length > 0) {
                throw new Error('Неможливо розпровести документ: деякі товари вже частково або повністю продані. Редагуйте документ без розпроведення або спершу розпроведіть відповідні продажі.');
            }

            // 1. Delete associated batches
            await client.query(`DELETE FROM "ProductBatch" WHERE "goodsReceiptId" = $1`, [id]);

            // 2. Update Status back to SAVED
            await client.query(`UPDATE "GoodsReceipt" SET "status" = 'SAVED', "updatedAt" = NOW() WHERE id = $1`, [id]);

            if (!txClient) await client.query('COMMIT');
            if (txClient) return { id, status: 'SAVED' };
            return this.getById(id);
        } catch (error) {
            if (!txClient) await client.query('ROLLBACK');
            throw error;
        } finally {
            if (!txClient) client.release();
        }
    }

    static async getById(id: string) {
        const docRes = await pool.query(`
    SELECT gr.*, c.name as "providerName", w.name as "warehouseName",
           (SELECT COALESCE(SUM(total), 0) FROM "GoodsReceiptItem" WHERE "goodsReceiptId" = gr.id) as amount
    FROM "GoodsReceipt" gr
    LEFT JOIN "Counterparty" c ON c.id = gr."providerId"
    LEFT JOIN "Warehouse" w ON w.id = gr."warehouseId"
    WHERE gr.id = $1
  `, [id]);

        if (docRes.rows.length === 0) return null;

        const itemsRes = await pool.query(`
    SELECT gri.*, p.name as "productName"
    FROM "GoodsReceiptItem" gri
    LEFT JOIN "Product" p ON p.id = gri."productId"::uuid
    WHERE gri."goodsReceiptId" = $1
    ORDER BY gri."sortOrder" ASC, gri."createdAt" ASC
  `, [id]);

        return { ...docRes.rows[0], items: itemsRes.rows };
    }


    // List
    static async getAll(filters: any) {
        let query = `
            SELECT gr.*, c.name as "providerName", w.name as "warehouseName",
                   (SELECT COALESCE(SUM(total), 0) FROM "GoodsReceiptItem" WHERE "goodsReceiptId" = gr.id) as amount
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

    // Delete
    static async delete(id: string) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const docRes = await client.query('SELECT status FROM "GoodsReceipt" WHERE id = $1 FOR UPDATE', [id]);
            if (docRes.rows.length === 0) throw new Error('Document not found');
            
            if (docRes.rows[0].status === 'POSTED') {
                throw new Error('Cannot delete a POSTED document');
            }

            await client.query('DELETE FROM "GoodsReceiptItem" WHERE "goodsReceiptId" = $1', [id]);
            await client.query('DELETE FROM "GoodsReceipt" WHERE id = $1', [id]);
            
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
