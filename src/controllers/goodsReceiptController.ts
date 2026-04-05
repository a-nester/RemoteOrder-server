import { GoodsReceiptService } from '../services/goodsReceiptService.js';

export class GoodsReceiptController {

    // GET /api/goods-receipt
    static async getAll(req: any, res: any) {
        try {
            const user = req.user;
            const filters = {
                startDate: req.query.startDate,
                endDate: req.query.endDate,
                warehouseId: user && user.role !== 'admin' ? user.warehouseId : undefined
            };
            const docs = await GoodsReceiptService.getAll(filters);
            res.json(docs);
        } catch (error) {
            console.error('Get GoodsReceipts error:', error);
            res.status(500).json({ error: 'Failed to fetch' });
        }
    }

    // GET /api/goods-receipt/:id
    static async getById(req: any, res: any) {
        try {
            const doc = await GoodsReceiptService.getById(req.params.id);
            if (!doc) return res.status(404).json({ error: 'Not found' });
            res.json(doc);
        } catch (error) {
            console.error('Get GoodsReceipt error:', error);
            res.status(500).json({ error: 'Failed to fetch details' });
        }
    }

    // POST /api/goods-receipt (Create)
    static async create(req: any, res: any) {
        try {
            const user = req.user;
            const userId = req.user?.id || 'system';
            
            let data = req.body;
            if (user && user.role !== 'admin' && user.warehouseId) {
                data.warehouseId = user.warehouseId;
            }

            const doc = await GoodsReceiptService.create(data, userId);
            res.status(201).json(doc);
        } catch (error) {
            console.error('Create GoodsReceipt error:', error);
            res.status(500).json({ error: 'Failed to create' });
        }
    }

    // PUT /api/goods-receipt/:id (Update)
    static async update(req: any, res: any) {
        try {
            const user = req.user;
            let data = req.body;
            if (user && user.role !== 'admin' && user.warehouseId) {
                data.warehouseId = user.warehouseId;
            }

            const doc = await GoodsReceiptService.update(req.params.id, data);
            res.json(doc);
        } catch (error: any) {
            console.error('Update GoodsReceipt error:', error);
            if (error.message === 'Cannot edit POSTED document') {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: 'Failed to update' });
        }
    }

    // POST /api/goods-receipt/:id/post (Post/Conduct)
    static async post(req: any, res: any) {
        try {
            const doc = await GoodsReceiptService.post(req.params.id);
            res.json(doc);
        } catch (error: any) {
            console.error('Post GoodsReceipt error:', error);
            if (error.message === 'Document already posted') {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: 'Failed to post document' });
        }
    }

    // POST /api/goods-receipt/:id/unpost (Cancel Post)
    static async unpost(req: any, res: any) {
        try {
            const doc = await GoodsReceiptService.unpost(req.params.id);
            res.json(doc);
        } catch (error: any) {
            console.error('Unpost GoodsReceipt error:', error);
            if (error.message === 'Document is not posted') {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: 'Failed to unpost document' });
        }
    }

    // DELETE /api/goods-receipt/:id
    static async delete(req: any, res: any) {
        try {
            const doc = await GoodsReceiptService.delete(req.params.id);
            res.json(doc);
        } catch (error: any) {
            console.error('Delete GoodsReceipt error:', error);
            if (error.message === 'Cannot delete a POSTED document') {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: 'Failed to delete' });
        }
    }
}
