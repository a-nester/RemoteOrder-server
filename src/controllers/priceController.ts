import { PriceService, PriceSetParams } from '../services/priceService.js';

export class PriceController {
    // POST /api/prices/set
    static async setPrice(req: any, res: any) {
        try {
            const { productId, price, priceTypeId, reason, effectiveDate } = req.body;

            if (!productId || price === undefined) {
                return res.status(400).json({ error: 'Missing required fields: productId, price' });
            }

            // In a real app we'd get userId from req.user
            const userId = req.user?.id;

            const params: PriceSetParams = {
                productId,
                newPrice: Number(price),
                priceTypeId,
                userId,
                reason
            };

            if (effectiveDate) {
                params.effectiveDate = new Date(effectiveDate);
            }

            const result = await PriceService.setPrice(req.dbClient || require('../db.js').default, params);

            res.json({ success: true, data: result });
        } catch (error) {
            console.error('Set price error:', error);
            res.status(500).json({ error: 'Failed to set price' });
        }
    }

    // GET /api/prices/history/:productId
    static async getHistory(req: any, res: any) {
        try {
            const { productId } = req.params;
            const history = await PriceService.getHistory(productId);
            res.json(history);
        } catch (error) {
            console.error('Get price history error:', error);
            res.status(500).json({ error: 'Failed to get price history' });
        }
    }
}
