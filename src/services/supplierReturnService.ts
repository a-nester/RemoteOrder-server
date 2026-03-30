import pool from '../db.js';
import { InventoryService } from './inventoryService.js';
import { generateDocNumber } from '../utils/docNumberGenerator.js';

export class SupplierReturnService {

    // Create Draft
    static async create(data: any, userId: string) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { date, supplierId, warehouseId, comment, items } = data;

            // Generate Number
            const number = await generateDocNumber('SupplierReturn', date ? new Date(date) : new Date(), 'number');

            // 1. Create Header
            const result = await client.query(
                `INSERT INTO "SupplierReturn" 
                ("number", "date", "supplierId", "warehouseId", "comment", "status", "createdBy")
                VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6)
                RETURNING *`,
                [number, date, supplierId, warehouseId, comment, userId]
            );
            const sr = result.rows[0];

            // 2. Create Items
            let totalAmount = 0;
            if (items && items.length > 0) {
                let sortOrder = 0;
                for (const item of items) {
                    const itemTotal = Number(item.quantity) * Number(item.price);
                    totalAmount += itemTotal;
                    
                    await client.query(
                        `INSERT INTO "SupplierReturnItem" 
                        ("supplierReturnId", "productId", "quantity", "price", "total", "sortOrder")
                        VALUES ($1, $2, $3, $4, $5, $6)`,
                        [sr.id, item.productId, item.quantity, item.price, itemTotal, sortOrder++]
                    );
                }
            }

            // Update Total Amount on Header
            await client.query(`UPDATE "SupplierReturn" SET "totalAmount" = $1 WHERE id = $2`, [totalAmount, sr.id]);

            await client.query('COMMIT');
            return this.getById(sr.id);
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
            await client.query('BEGIN');
            const { date, supplierId, warehouseId, comment, items } = data;

            // Check if exists and is not posted
            const check = await client.query(`SELECT status FROM "SupplierReturn" WHERE id = $1 FOR UPDATE`, [id]);
            if (check.rows.length === 0) throw new Error('Document not found');
            if (check.rows[0].status === 'POSTED') throw new Error('Cannot edit POSTED document');

            // Update Header
            await client.query(
                `UPDATE "SupplierReturn" 
                SET "date" = COALESCE($1, "date"), 
                    "supplierId" = COALESCE($2, "supplierId"), 
                    "warehouseId" = COALESCE($3, "warehouseId"), 
                    "comment" = $4,
                    "updatedAt" = NOW()
                WHERE id = $5`,
                [date, supplierId, warehouseId, comment, id]
            );

            // Update Items (delete old, insert new)
            await client.query(`DELETE FROM "SupplierReturnItem" WHERE "supplierReturnId" = $1`, [id]);

            let totalAmount = 0;
            if (items && items.length > 0) {
                let sortOrder = 0;
                for (const item of items) {
                    const itemTotal = Number(item.quantity) * Number(item.price);
                    totalAmount += itemTotal;
                    
                    await client.query(
                        `INSERT INTO "SupplierReturnItem" 
                        ("supplierReturnId", "productId", "quantity", "price", "total", "sortOrder")
                        VALUES ($1, $2, $3, $4, $5, $6)`,
                        [id, item.productId, item.quantity, item.price, itemTotal, sortOrder++]
                    );
                }
            }

            // Update Total Amount
            await client.query(`UPDATE "SupplierReturn" SET "totalAmount" = $1 WHERE id = $2`, [totalAmount, id]);

            await client.query('COMMIT');
            return this.getById(id);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Post Document (Subtract Stock - Supplier return reduces our inventory)
    static async post(id: string) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const docRes = await client.query(`SELECT * FROM "SupplierReturn" WHERE id = $1 FOR UPDATE`, [id]);
            if (docRes.rows.length === 0) throw new Error('Document not found');
            const doc = docRes.rows[0];

            if (doc.status === 'POSTED') throw new Error('Document already posted');

            const itemsRes = await client.query(`SELECT * FROM "SupplierReturnItem" WHERE "supplierReturnId" = $1 ORDER BY "sortOrder" ASC`, [id]);
            const items = itemsRes.rows;

            for (const item of items) {
                // Логування залишків ДО списання
                const stockBefore = await client.query('SELECT SUM("quantityLeft") as q FROM "ProductBatch" WHERE "productId" = $1', [item.productId]);
                console.log(`[SupplierReturnService] ДО списання товару ${item.productId}. Потрібно списати: ${item.quantity}. Поточний загальний залишок: ${stockBefore.rows[0].q || 0}`);

                // Deduct stock using FIFO logic, returns an array of deducted batches
                const deductions = await InventoryService.deductStock(
                    client,
                    item.productId,
                    Number(item.quantity),
                    doc.warehouseId
                );

                for (const deduction of deductions) {
                    // Record the relation mapping
                    await client.query(
                        `INSERT INTO "SupplierReturnItemBatch" ("supplierReturnItemId", "productBatchId", "quantity", "enterPrice")
                         VALUES ($1, $2, $3, $4)`,
                        [item.id, deduction.batchId, deduction.quantity, deduction.enterPrice]
                    );
                }

                // Логування залишків ПІСЛЯ списання
                const stockAfter = await client.query('SELECT SUM("quantityLeft") as q FROM "ProductBatch" WHERE "productId" = $1', [item.productId]);
                console.log(`[SupplierReturnService] ПІСЛЯ списання товару ${item.productId}. Поточний загальний залишок: ${stockAfter.rows[0].q || 0}`);
            }

            // Update Status
            await client.query(
                `UPDATE "SupplierReturn" SET "status" = 'POSTED', "updatedAt" = NOW() WHERE id = $1`, 
                [id]
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
            await client.query('BEGIN');
            
            const docRes = await client.query(`SELECT * FROM "SupplierReturn" WHERE id = $1 FOR UPDATE`, [id]);
            if (docRes.rows.length === 0) throw new Error('Document not found');
            const doc = docRes.rows[0];

            if (doc.status !== 'POSTED') throw new Error('Document is not posted');

            // Find all item batches deducted by this return
            const itemBatchesRes = await client.query(`
                SELECT brib."supplierReturnItemId", brib."productBatchId", brib."quantity", brib."enterPrice"
                FROM "SupplierReturnItemBatch" brib
                JOIN "SupplierReturnItem" sri ON sri.id = brib."supplierReturnItemId"
                WHERE sri."supplierReturnId" = $1
            `, [id]);

            // Re-add quantities back to the exact same product batches
            for (const batch of itemBatchesRes.rows) {
                await client.query(`
                    UPDATE "ProductBatch"
                    SET "quantityLeft" = "quantityLeft" + $1,
                        "updatedAt" = NOW()
                    WHERE id = $2
                `, [batch.quantity, batch.productBatchId]);
            }

            // Delete the batch linkage records
            await client.query(`
                DELETE FROM "SupplierReturnItemBatch"
                WHERE "supplierReturnItemId" IN (SELECT id FROM "SupplierReturnItem" WHERE "supplierReturnId" = $1)
            `, [id]);

            // Update Status back to DRAFT
            await client.query(`
                UPDATE "SupplierReturn" 
                SET "status" = 'DRAFT', "updatedAt" = NOW() 
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
            SELECT sr.*, c.name as "supplierName", w.name as "warehouseName", u.email as "authorName"
            FROM "SupplierReturn" sr
            LEFT JOIN "Counterparty" c ON c.id = sr."supplierId"
            LEFT JOIN "Warehouse" w ON w.id = sr."warehouseId"
            LEFT JOIN "User" u ON u.id::text = sr."createdBy"
            WHERE sr.id = $1
        `, [id]);

        if (docRes.rows.length === 0) return null;

        const itemsRes = await pool.query(`
            SELECT sri.*, p.name as "productName"
            FROM "SupplierReturnItem" sri
            LEFT JOIN "Product" p ON p.id = sri."productId"
            WHERE sri."supplierReturnId" = $1
            ORDER BY sri."sortOrder" ASC, sri."createdAt" ASC
        `, [id]);

        return { ...docRes.rows[0], items: itemsRes.rows };
    }

    // List
    static async getAll(filters: any) {
        let query = `
            SELECT sr.*, c.name as "supplierName", w.name as "warehouseName"
            FROM "SupplierReturn" sr
            LEFT JOIN "Counterparty" c ON c.id = sr."supplierId"
            LEFT JOIN "Warehouse" w ON w.id = sr."warehouseId"
            WHERE 1=1
        `;
        const params: any[] = [];
        let pIdx = 1;

        if (filters.startDate) {
            query += ` AND sr."date" >= $${pIdx++}`;
            params.push(filters.startDate);
        }
        if (filters.endDate) {
            query += ` AND sr."date" <= $${pIdx++}`;
            params.push(`${filters.endDate} 23:59:59`);
        }

        query += ` ORDER BY sr."date" DESC, sr."createdAt" DESC`;

        const result = await pool.query(query, params);
        return result.rows;
    }

    static async delete(id: string) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const docRes = await client.query('SELECT status FROM "SupplierReturn" WHERE id = $1 FOR UPDATE', [id]);
            if (docRes.rows.length === 0) throw new Error('Document not found');
            
            if (docRes.rows[0].status === 'POSTED') {
                throw new Error('Cannot delete a POSTED document');
            }

            await client.query('DELETE FROM "SupplierReturnItem" WHERE "supplierReturnId" = $1', [id]);
            await client.query('DELETE FROM "SupplierReturn" WHERE id = $1', [id]);
            
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
