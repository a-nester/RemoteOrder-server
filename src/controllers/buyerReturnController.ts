import { BuyerReturnService } from '../services/buyerReturnService.js';

export class BuyerReturnController {

    // GET /api/buyer-returns
    static async getAll(req: any, res: any) {
        try {
            const filters = {
                startDate: req.query.startDate,
                endDate: req.query.endDate
            };
            const docs = await BuyerReturnService.getAll(filters);
            res.json(docs);
        } catch (error) {
            console.error('Get BuyerReturns error:', error);
            res.status(500).json({ error: 'Failed to fetch' });
        }
    }

    // GET /api/buyer-returns/:id
    static async getById(req: any, res: any) {
        try {
            const doc = await BuyerReturnService.getById(req.params.id);
            if (!doc) return res.status(404).json({ error: 'Not found' });
            res.json(doc);
        } catch (error) {
            console.error('Get BuyerReturn error:', error);
            res.status(500).json({ error: 'Failed to fetch details' });
        }
    }

    // POST /api/buyer-returns
    static async create(req: any, res: any) {
        try {
            const userId = req.user?.id || 'system';
            const doc = await BuyerReturnService.create(req.body, userId);
            res.status(201).json(doc);
        } catch (error) {
            console.error('Create BuyerReturn error:', error);
            res.status(500).json({ error: 'Failed to create' });
        }
    }

    // PUT /api/buyer-returns/:id
    static async update(req: any, res: any) {
        try {
            const doc = await BuyerReturnService.update(req.params.id, req.body);
            res.json(doc);
        } catch (error: any) {
            console.error('Update BuyerReturn error:', error);
            if (error.message === 'Cannot edit POSTED document' || error.message === 'Document not found') {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: 'Failed to update' });
        }
    }

    // POST /api/buyer-returns/:id/post
    static async post(req: any, res: any) {
        try {
            const doc = await BuyerReturnService.post(req.params.id);
            res.json(doc);
        } catch (error: any) {
            console.error('Post BuyerReturn error:', error);
            if (error.message === 'Document already posted' || error.message === 'Document not found') {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: 'Failed to post document' });
        }
    }

    // POST /api/buyer-returns/:id/unpost
    static async unpost(req: any, res: any) {
        try {
            const doc = await BuyerReturnService.unpost(req.params.id);
            res.json(doc);
        } catch (error: any) {
            console.error('Unpost BuyerReturn error:', error);
            if (error.message === 'Document is not posted' || error.message === 'Document not found') {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: 'Failed to unpost document' });
        }
    }

    // DELETE /api/buyer-returns/:id
    static async delete(req: any, res: any) {
        try {
            await BuyerReturnService.delete(req.params.id);
            res.json({ success: true });
        } catch (error: any) {
            console.error('Delete BuyerReturn error:', error);
            if (error.message === 'Cannot delete a POSTED document' || error.message === 'Document not found') {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: 'Failed to delete' });
        }
    }
}
