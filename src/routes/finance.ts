import express from 'express';
import pool from '../db.js';
import { userAuth, AuthRequest } from '../middleware/auth.js';
import { generateDocNumber } from '../utils/docNumberGenerator.js';

const router = express.Router();

// ==========================================
// CASHBOXES
// ==========================================

router.get('/cashboxes', userAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM "Cashbox" ORDER BY "name" ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching cashboxes:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/cashboxes', userAuth, async (req, res) => {
    const { name, type, currency, organizationId } = req.body;
    try {
        const result = await pool.query(`
            INSERT INTO "Cashbox" ("name", "type", "currency", "organizationId")
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [name, type || 'CASH', currency || 'UAH', organizationId]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating cashbox:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/cashboxes/:id', userAuth, async (req, res) => {
    const { id } = req.params;
    const { name, type } = req.body;
    try {
        const result = await pool.query(`
            UPDATE "Cashbox" 
            SET "name" = $1, "type" = $2, "updatedAt" = NOW()
            WHERE id = $3
            RETURNING *
        `, [name, type, id]);
        
        if (result.rowCount === 0) return res.status(404).json({ message: 'Cashbox not found' });
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating cashbox:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ==========================================
// TRANSACTION CATEGORIES
// ==========================================

router.get('/categories', userAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM "TransactionCategory" ORDER BY "name" ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/categories', userAuth, async (req, res) => {
    const { name, type } = req.body; // INCOME, OUTCOME, BOTH
    try {
        const result = await pool.query(`
            INSERT INTO "TransactionCategory" ("name", "type")
            VALUES ($1, $2)
            RETURNING *
        `, [name, type || 'OUTCOME']);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating category:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/categories/:id', userAuth, async (req, res) => {
    const { id } = req.params;
    const { name, type } = req.body;
    try {
        const result = await pool.query(`
            UPDATE "TransactionCategory" 
            SET "name" = $1, "type" = $2, "updatedAt" = NOW()
            WHERE id = $3
            RETURNING *
        `, [name, type, id]);
        
        if (result.rowCount === 0) return res.status(404).json({ message: 'Category not found' });
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ==========================================
// CASH TRANSACTIONS (ОРДЕРИ & FIFO)
// ==========================================

router.get('/transactions', userAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT t.*, c.name as "cashboxName", cat.name as "categoryName", cp.name as "counterpartyName"
            FROM "CashTransaction" t
            JOIN "Cashbox" c ON t."cashboxId" = c.id
            LEFT JOIN "TransactionCategory" cat ON t."categoryId" = cat.id
            LEFT JOIN "Counterparty" cp ON t."counterpartyId" = cp.id
            WHERE t."isDeleted" = FALSE
            ORDER BY t.date DESC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/transactions', userAuth, async (req, res) => {
    const { date, type, cashboxId, amount, categoryId, counterpartyId, comment } = req.body;
    const userId = (req as AuthRequest).user?.id;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Check Cashbox
        const cbRes = await client.query('SELECT * FROM "Cashbox" WHERE id = $1', [cashboxId]);
        if (cbRes.rowCount === 0) throw new Error('Cashbox not found');

        // 2. Determine Transaction Number
        const number = await generateDocNumber('CashTransaction', new Date(date || Date.now()), 'number');

        // 3. Insert Transaction
        const tRes = await client.query(`
            INSERT INTO "CashTransaction" ("date", "number", "type", "cashboxId", "amount", "categoryId", "counterpartyId", "comment", "createdBy")
            VALUES (COALESCE($1, NOW()), $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [date, number, type, cashboxId, amount, categoryId, counterpartyId, comment, userId]);

        const transaction = tRes.rows[0];
        let remainingAmount = parseFloat(amount.toString());

        // 4. FIFO Debt Allocation
        if (counterpartyId && remainingAmount > 0) {
            if (type === 'INCOME') {
                // Offset client debt -> Realizations
                const unpaids = await client.query(`
                    SELECT id, amount, "paidAmount" 
                    FROM "Realization"
                    WHERE "counterpartyId" = $1 AND status = 'POSTED' AND "paidAmount" < amount
                    ORDER BY "date" ASC
                `, [counterpartyId]);

                for (const doc of unpaids.rows) {
                    if (remainingAmount <= 0) break;
                    
                    const docDebt = parseFloat(doc.amount) - parseFloat(doc.paidAmount);
                    const allocate = Math.min(docDebt, remainingAmount);
                    
                    if (allocate > 0) {
                        // Create Allocation string
                        await client.query(`
                            INSERT INTO "PaymentAllocation" ("cashTransactionId", "documentId", "documentType", "amount")
                            VALUES ($1, $2, 'REALIZATION', $3)
                        `, [transaction.id, doc.id, allocate]);

                        // Update Paid amount on Realization
                        await client.query(`
                            UPDATE "Realization" SET "paidAmount" = "paidAmount" + $1 WHERE id = $2
                        `, [allocate, doc.id]);

                        remainingAmount -= allocate;
                    }
                }
            } else if (type === 'OUTCOME') {
                // Offset supplier debt -> GoodsReceipts
                const unpaids = await client.query(`
                    SELECT id, total as amount, "paidAmount" 
                    FROM "GoodsReceipt"
                    WHERE "counterpartyId" = $1 AND status = 'POSTED' AND "paidAmount" < total
                    ORDER BY "date" ASC
                `, [counterpartyId]);

                for (const doc of unpaids.rows) {
                    if (remainingAmount <= 0) break;
                    
                    const docDebt = parseFloat(doc.amount) - parseFloat(doc.paidAmount);
                    const allocate = Math.min(docDebt, remainingAmount);
                    
                    if (allocate > 0) {
                        // Create Allocation string
                        await client.query(`
                            INSERT INTO "PaymentAllocation" ("cashTransactionId", "documentId", "documentType", "amount")
                            VALUES ($1, $2, 'GOODS_RECEIPT', $3)
                        `, [transaction.id, doc.id, allocate]);

                        // Update Paid amount on GoodsReceipt
                        await client.query(`
                            UPDATE "GoodsReceipt" SET "paidAmount" = "paidAmount" + $1 WHERE id = $2
                        `, [allocate, doc.id]);

                        remainingAmount -= allocate;
                    }
                }
            }
        }

        await client.query('COMMIT');
        res.status(201).json(transaction);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating transaction:', error);
        res.status(500).json({ message: error instanceof Error ? error.message : 'Server error' });
    } finally {
        client.release();
    }
});

router.delete('/transactions/:id', userAuth, async (req, res) => {
    // Soft delete to prevent cascade breaking, or handle reverting physical allocations if needed.
    // Keeping simple soft-delete mapped to business rules.
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Find ALL allocations and revert the paidAmount on documents
        const allocs = await client.query('SELECT * FROM "PaymentAllocation" WHERE "cashTransactionId" = $1', [id]);
        
        for (const alloc of allocs.rows) {
            if (alloc.documentType === 'REALIZATION') {
                 await client.query(`UPDATE "Realization" SET "paidAmount" = "paidAmount" - $1 WHERE id = $2`, [alloc.amount, alloc.documentId]);
            } else if (alloc.documentType === 'GOODS_RECEIPT') {
                 await client.query(`UPDATE "GoodsReceipt" SET "paidAmount" = "paidAmount" - $1 WHERE id = $2`, [alloc.amount, alloc.documentId]);
            }
        }
        
        // Remove Allocations
        await client.query('DELETE FROM "PaymentAllocation" WHERE "cashTransactionId" = $1', [id]);
        
        // Mark Transaction Deleted
        await client.query(`UPDATE "CashTransaction" SET "isDeleted" = TRUE WHERE id = $1`, [id]);
        
        await client.query('COMMIT');
        res.json({ message: 'Transaction deleted and allocations reverted' });
    } catch (error) {
         await client.query('ROLLBACK');
         console.error('Error deleting transaction:', error);
         res.status(500).json({ message: 'Server error' });
    } finally {
         client.release();
    }
});

export default router;
