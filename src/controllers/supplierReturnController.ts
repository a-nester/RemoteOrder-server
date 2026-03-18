import { SupplierReturnService } from '../services/supplierReturnService.js';

export class SupplierReturnController {

    // GET /api/supplier-returns
    static async getAll(req: any, res: any) {
        try {
            const filters = {
                startDate: req.query.startDate,
                endDate: req.query.endDate
            };
            const docs = await SupplierReturnService.getAll(filters);
            res.json(docs);
        } catch (error) {
            console.error('Get SupplierReturns error:', error);
            res.status(500).json({ error: 'Failed to fetch' });
        }
    }

    // GET /api/supplier-returns/:id
    static async getById(req: any, res: any) {
        try {
            const doc = await SupplierReturnService.getById(req.params.id);
            if (!doc) return res.status(404).json({ error: 'Not found' });
            res.json(doc);
        } catch (error) {
            console.error('Get SupplierReturn error:', error);
            res.status(500).json({ error: 'Failed to fetch details' });
        }
    }

    // POST /api/supplier-returns
    static async create(req: any, res: any) {
        try {
            const userId = req.user?.id || 'system';
            const doc = await SupplierReturnService.create(req.body, userId);
            res.status(201).json(doc);
        } catch (error) {
            console.error('Create SupplierReturn error:', error);
            res.status(500).json({ error: 'Failed to create' });
        }
    }

    // PUT /api/supplier-returns/:id
    static async update(req: any, res: any) {
        try {
            const doc = await SupplierReturnService.update(req.params.id, req.body);
            res.json(doc);
        } catch (error: any) {
            console.error('Update SupplierReturn error:', error);
            if (error.message === 'Cannot edit POSTED document' || error.message === 'Document not found') {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: 'Failed to update' });
        }
    }

    // POST /api/supplier-returns/:id/post
    static async post(req: any, res: any) {
        try {
            const doc = await SupplierReturnService.post(req.params.id);
            res.json(doc);
        } catch (error: any) {
            console.error('Post SupplierReturn error:', error);
            if (error.message === 'Document already posted' || error.message === 'Document not found') {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: 'Failed to post document' });
        }
    }

    // POST /api/supplier-returns/:id/unpost
    static async unpost(req: any, res: any) {
        try {
            const doc = await SupplierReturnService.unpost(req.params.id);
            res.json(doc);
        } catch (error: any) {
            console.error('Unpost SupplierReturn error:', error);
            if (error.message === 'Document is not posted' || error.message === 'Document not found') {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: 'Failed to unpost document' });
        }
    }

    // DELETE /api/supplier-returns/:id
    static async delete(req: any, res: any) {
        try {
            await SupplierReturnService.delete(req.params.id);
            res.json({ success: true });
        } catch (error: any) {
            console.error('Delete SupplierReturn error:', error);
            if (error.message === 'Cannot delete a POSTED document' || error.message === 'Document not found') {
                return res.status(400).json({ error: error.message });
            }
            res.status(500).json({ error: 'Failed to delete' });
        }
    }
}
