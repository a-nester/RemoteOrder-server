import { InventoryService } from '../services/inventoryService.js';
import pool from '../db.js';

export class InventoryController {

    // POST /api/inventory/arrival
    static async addArrival(req: any, res: any) {
        const client = await pool.connect();
        try {
            const { productId, quantity, enterPrice } = req.body;

            if (!productId || !quantity || enterPrice === undefined) {
                return res.status(400).json({ error: 'Missing required fields: productId, quantity, enterPrice' });
            }

            await client.query('BEGIN');

            const batch = await InventoryService.addStock(client, productId, quantity, enterPrice);

            await client.query('COMMIT');

            res.status(201).json(batch);
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Inventory arrival error:', error);
            res.status(500).json({ error: 'Failed to add inventory' });
        } finally {
            client.release();
        }
    }

    // GET /api/inventory/stock/:productId
    static async getStock(req: any, res: any) {
        try {
            const { productId } = req.params;
            const result = await pool.query(
                `SELECT * FROM "ProductBatch" WHERE "productId" = $1 AND "quantityLeft" > 0 ORDER BY "createdAt" ASC`,
                [productId]
            );
            res.json(result.rows);
        } catch (error) {
            console.error('Get stock error:', error);
            res.status(500).json({ error: 'Failed to get stock' });
        }
    }
}
