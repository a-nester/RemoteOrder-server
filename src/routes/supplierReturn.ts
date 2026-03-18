import { Router } from 'express';
import { SupplierReturnController } from '../controllers/supplierReturnController.js';
import { adminAuth } from '../middleware/auth.js';

const router = Router();

router.use(adminAuth);

router.get('/', SupplierReturnController.getAll);
router.get('/:id', SupplierReturnController.getById);

router.post('/', SupplierReturnController.create);
router.put('/:id', SupplierReturnController.update);
router.delete('/:id', SupplierReturnController.delete);

router.post('/:id/post', SupplierReturnController.post);
router.post('/:id/unpost', SupplierReturnController.unpost);

export default router;
