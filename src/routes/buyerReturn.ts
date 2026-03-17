import { Router } from 'express';
import { BuyerReturnController } from '../controllers/buyerReturnController.js';
import { adminAuth } from '../middleware/auth.js';

const router = Router();

// Apply auth middleware to all routes in this router
router.use(adminAuth);
// Assuming documents are accessible by everyone authenticated, or just managers/admins. 
// Standard structure: allow access. You can add checkRole(['admin', 'manager']) if needed.

router.get('/', BuyerReturnController.getAll);
router.get('/:id', BuyerReturnController.getById);

// Create new return draft
router.post('/', BuyerReturnController.create);

// Update existing return draft
router.put('/:id', BuyerReturnController.update);

// Delete draft
router.delete('/:id', BuyerReturnController.delete);

// Post (execute stock return and profit reduction)
router.post('/:id/post', BuyerReturnController.post);

// Unpost
router.post('/:id/unpost', BuyerReturnController.unpost);

export default router;
