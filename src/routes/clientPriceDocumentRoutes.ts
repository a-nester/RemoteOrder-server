import { Router } from 'express';
import { adminAuth } from '../middleware/auth.js';
import {
    getAllClientPriceDocuments,
    getClientPriceDocumentById,
    prepareClientPriceDocumentItems,
    createClientPriceDocument,
    updateClientPriceDocument,
    applyClientPriceDocument,
    unpostClientPriceDocument,
    deleteClientPriceDocument,
    getActiveClientDiscounts,
    copyClientPriceDocument
} from '../controllers/clientPriceDocumentController.js';

const router = Router();

router.use(adminAuth);

router.get('/', getAllClientPriceDocuments);
router.get('/prepare-items', prepareClientPriceDocumentItems);
router.get('/discounts/:counterpartyId', getActiveClientDiscounts);
router.get('/:id', getClientPriceDocumentById);
router.post('/', createClientPriceDocument);
router.put('/:id', updateClientPriceDocument);
router.post('/:id/apply', applyClientPriceDocument);
router.post('/:id/unpost', unpostClientPriceDocument);
router.post('/:id/copy', copyClientPriceDocument);
router.delete('/:id', deleteClientPriceDocument);

export default router;
