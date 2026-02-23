import express from 'express';
import { GoodsReceiptController } from '../controllers/goodsReceiptController.js';
import { userAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(userAuth); // Protect all routes

router.get('/', GoodsReceiptController.getAll);
router.get('/:id', GoodsReceiptController.getById);
router.post('/', GoodsReceiptController.create);
router.put('/:id', GoodsReceiptController.update);
router.post('/:id/post', GoodsReceiptController.post);
router.post('/:id/unpost', GoodsReceiptController.unpost);

export default router;
