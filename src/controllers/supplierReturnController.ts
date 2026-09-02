import { SupplierReturnService } from '../services/supplierReturnService.js';

function formatSupplierReturnError(error: any): string {
    if (!error) return 'Невідома помилка';
    const rawMessage = error.message || String(error);

    try {
        const parsed = JSON.parse(rawMessage);
        if (parsed && parsed.code === 'INSUFFICIENT_STOCK') {
            return `Недостатньо товару "${parsed.productName || 'Товар'}" на складі для повернення. Потрібно: ${parsed.needed}, в наявності: ${parsed.available || 0}`;
        }
    } catch (e) {
        // Not JSON
    }

    return rawMessage;
}

export class SupplierReturnController {

    // GET /api/supplier-returns
    static async getAll(req: any, res: any) {
        try {
            const user = req.user;
            const filters = {
                startDate: req.query.startDate,
                endDate: req.query.endDate,
                warehouseId: user && user.role !== 'admin' ? user.warehouseId : undefined
            };
            const docs = await SupplierReturnService.getAll(filters);
            res.json(docs);
        } catch (error: any) {
            console.error('Get SupplierReturns error:', error);
            const msg = formatSupplierReturnError(error);
            res.status(500).json({ error: msg, message: msg });
        }
    }

    // GET /api/supplier-returns/:id
    static async getById(req: any, res: any) {
        try {
            const doc = await SupplierReturnService.getById(req.params.id);
            if (!doc) return res.status(404).json({ error: 'Документ не знайдено' });
            res.json(doc);
        } catch (error: any) {
            console.error('Get SupplierReturn error:', error);
            const msg = formatSupplierReturnError(error);
            res.status(500).json({ error: msg, message: msg });
        }
    }

    // POST /api/supplier-returns
    static async create(req: any, res: any) {
        try {
            const user = req.user;
            const userId = req.user?.id || 'system';
            
            let data = req.body;
            if (user && user.role !== 'admin' && user.warehouseId) {
                data.warehouseId = user.warehouseId;
            }

            const doc = await SupplierReturnService.create(data, userId);
            res.status(201).json(doc);
        } catch (error: any) {
            console.error('Create SupplierReturn error:', error);
            const msg = formatSupplierReturnError(error);
            res.status(400).json({ error: msg, message: msg });
        }
    }

    // PUT /api/supplier-returns/:id
    static async update(req: any, res: any) {
        try {
            const user = req.user;
            let data = req.body;
            if (user && user.role !== 'admin' && user.warehouseId) {
                data.warehouseId = user.warehouseId;
            }

            const doc = await SupplierReturnService.update(req.params.id, data);
            res.json(doc);
        } catch (error: any) {
            console.error('Update SupplierReturn error:', error);
            const msg = formatSupplierReturnError(error);
            res.status(400).json({ error: msg, message: msg });
        }
    }

    // POST /api/supplier-returns/:id/post
    static async post(req: any, res: any) {
        try {
            const doc = await SupplierReturnService.post(req.params.id);
            res.json(doc);
        } catch (error: any) {
            console.error('Post SupplierReturn error:', error);
            const msg = formatSupplierReturnError(error);
            res.status(400).json({ error: msg, message: msg });
        }
    }

    // POST /api/supplier-returns/:id/unpost
    static async unpost(req: any, res: any) {
        try {
            const doc = await SupplierReturnService.unpost(req.params.id);
            res.json(doc);
        } catch (error: any) {
            console.error('Unpost SupplierReturn error:', error);
            const msg = formatSupplierReturnError(error);
            res.status(400).json({ error: msg, message: msg });
        }
    }

    // DELETE /api/supplier-returns/:id
    static async delete(req: any, res: any) {
        try {
            await SupplierReturnService.delete(req.params.id);
            res.json({ success: true });
        } catch (error: any) {
            console.error('Delete SupplierReturn error:', error);
            const msg = formatSupplierReturnError(error);
            res.status(400).json({ error: msg, message: msg });
        }
    }
}
