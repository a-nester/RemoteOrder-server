import { Router } from 'express';
import {
    createDocument,
    getDocuments,
    getDocument,
    updateDocument,
    updateDocumentItems,
    applyDocument,
    copyDocument
} from '../controllers/priceDocumentController.js';

const router = Router();

router.post('/', createDocument);
router.get('/', getDocuments);
router.get('/:id', getDocument);
router.put('/:id', updateDocument);
router.put('/:id/items', updateDocumentItems);
router.post('/:id/apply', applyDocument);
router.post('/:id/copy', copyDocument);

export default router;
