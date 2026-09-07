import { Router } from 'express';
import {
    getAllClientPriceDocuments,
    getClientPriceDocumentById,
    prepareClientPriceDocumentItems,
    createClientPriceDocument,
    updateClientPriceDocument,
    applyClientPriceDocument,
    unpostClientPriceDocument,
    deleteClientPriceDocument,
    getActiveClientDiscounts
} from '../controllers/clientPriceDocumentController.js';

const router = Router();

router.get('/', getAllClientPriceDocuments);
router.get('/prepare-items', prepareClientPriceDocumentItems);
router.get('/discounts/:counterpartyId', getActiveClientDiscounts);
router.get('/:id', getClientPriceDocumentById);
router.post('/', createClientPriceDocument);
router.put('/:id', updateClientPriceDocument);
router.post('/:id/apply', applyClientPriceDocument);
router.post('/:id/unpost', unpostClientPriceDocument);
router.delete('/:id', deleteClientPriceDocument);

export default router;

