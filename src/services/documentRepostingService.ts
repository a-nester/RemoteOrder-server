import pool from '../db.js';
import { GoodsReceiptService } from './goodsReceiptService.js';
import { RealizationService } from './realizationService.js';
import { BuyerReturnService } from './buyerReturnService.js';
import { PriceDocumentService } from './priceDocumentService.js';
import { EventEmitter } from 'events';

export const repostingEvents = new EventEmitter();

export class DocumentRepostingService {
    static async run(userId?: string) {
        let client = null;
        try {
            client = await pool.connect();
            
            // 1. Acquire System Lock
            const lockCheck = await client.query('SELECT "isLocked" FROM "DocumentLock" WHERE id = $1', ['document_operations']);
            if (lockCheck.rows.length > 0 && lockCheck.rows[0].isLocked) {
                throw new Error('System is already locked. Reposting might already be in progress.');
            }

            // Lock it
            await client.query(`UPDATE "DocumentLock" SET "isLocked" = true, "lockedBy" = $1, "lockedAt" = NOW(), reason = 'Bulk document reposting' WHERE id = 'document_operations'`, [userId]);
            
            this.emitLog('Starting Document Reposting process...');
            this.emitLog('System locked for maintenance.');

            // Fetch all POSTED/APPLIED documents
            const realizations = await client.query('SELECT id, date, "createdAt" as created_at FROM "Realization" WHERE status = $1 ORDER BY date DESC, "createdAt" DESC', ['POSTED']);
            const buyerReturns = await client.query('SELECT id, date, "createdAt" as created_at FROM "BuyerReturn" WHERE status = $1 ORDER BY date DESC, "createdAt" DESC', ['POSTED']);
            const goodsReceipts = await client.query('SELECT id, date, "createdAt" as created_at FROM "GoodsReceipt" WHERE status = $1 ORDER BY date DESC, "createdAt" DESC', ['POSTED']);
            const priceDocs = await client.query('SELECT id, date, "createdAt" as created_at FROM "PriceDocument" WHERE status = $1 ORDER BY date DESC, "createdAt" DESC', ['APPLIED']);

            // 1. UNPOST sequence (Reverse Chronological)
            this.emitLog(`Phase 1: Unposting ${realizations.rowCount} Realizations...`);
            for (const row of realizations.rows) {
                await RealizationService.unpost(row.id);
                this.emitLog(`Unposted Realization: ${row.id}`);
            }

            this.emitLog(`Phase 1: Unposting ${buyerReturns.rowCount} Buyer Returns...`);
            for (const row of buyerReturns.rows) {
                await BuyerReturnService.unpost(row.id);
                this.emitLog(`Unposted Buyer Return: ${row.id}`);
            }

            this.emitLog(`Phase 1: Unposting ${goodsReceipts.rowCount} Goods Receipts...`);
            for (const row of goodsReceipts.rows) {
                await GoodsReceiptService.unpost(row.id);
                this.emitLog(`Unposted Goods Receipt: ${row.id}`);
            }

            this.emitLog(`Phase 1: Resetting ${priceDocs.rowCount} Price Documents...`);
            for (const row of priceDocs.rows) {
                await client.query(`DELETE FROM "PriceJournal" WHERE "reason" = 'Price Document Applied' AND "createdAt" = $1`, [row.created_at]);
                await client.query(`UPDATE "PriceDocument" SET status = 'DRAFT' WHERE id = $1`, [row.id]);
                this.emitLog(`Reset Price Document: ${row.id}`);
            }

            // Evaluate current state (all unposted!)
            // 2. POST sequence
            // Combine all to post in chronological order
            let toPost = [
                ...realizations.rows.map(r => ({ ...r, type: 'REALIZATION' })),
                ...buyerReturns.rows.map(r => ({ ...r, type: 'BUYER_RETURN' })),
                ...goodsReceipts.rows.map(r => ({ ...r, type: 'GOODS_RECEIPT' })),
                ...priceDocs.rows.map(r => ({ ...r, type: 'PRICE_DOCUMENT' }))
            ];

            // Sort ASC chronologically
            toPost.sort((a, b) => {
                const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
                if (dateDiff !== 0) return dateDiff;
                
                // If same date, Receipt/Price should post before Realization usually
                const typeWeight: Record<string, number> = {
                    'GOODS_RECEIPT': 1,
                    'PRICE_DOCUMENT': 2,
                    'BUYER_RETURN': 3,
                    'REALIZATION': 4
                };
                
                const typeDiff = (typeWeight[a.type] || 0) - (typeWeight[b.type] || 0);
                if (typeDiff !== 0) return typeDiff;

                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            });

            this.emitLog(`Phase 2: Reposting ${toPost.length} documents chronologically...`);

            for (const doc of toPost) {
                try {
                    if (doc.type === 'GOODS_RECEIPT') {
                        await GoodsReceiptService.post(doc.id);
                        this.emitLog(`Posted Goods Receipt: ${doc.id}`);
                    } else if (doc.type === 'PRICE_DOCUMENT') {
                        await PriceDocumentService.apply(doc.id);
                        this.emitLog(`Applied Price Document: ${doc.id}`);
                    } else if (doc.type === 'BUYER_RETURN') {
                        await BuyerReturnService.post(doc.id);
                        this.emitLog(`Posted Buyer Return: ${doc.id}`);
                    } else if (doc.type === 'REALIZATION') {
                        await RealizationService.post(doc.id);
                        this.emitLog(`Posted Realization: ${doc.id}`);
                    }
                } catch (postErr: any) {
                    this.emitLog(`Error posting ${doc.type} ${doc.id}: ${postErr.message}`);
                    throw postErr; // Abort on first post failure to avoid inconsistent state, or continue? Abort is safer.
                }
            }

            this.emitLog('Document Reposting process completed successfully.');
            
        } catch (error: any) {
            console.error('Reposting error:', error);
            this.emitLog(`ERROR: ${error.message}`);
            throw error;
        } finally {
            if (client) {
                // Release System Lock
                try {
                    await client.query(`UPDATE "DocumentLock" SET "isLocked" = false, "lockedBy" = null, "lockedAt" = null, reason = null WHERE id = 'document_operations'`);
                    this.emitLog('System unlocked.');
                } catch (e) {
                    console.error('Failed to release system lock!', e);
                }
                client.release();
            }
        }
    }

    private static emitLog(message: string) {
        console.log(`[RepostService] ${message}`);
        repostingEvents.emit('message', { data: message }); // SSE standard
    }
}
