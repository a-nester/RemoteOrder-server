import { Request, Response } from 'express';
import { ClientPriceDocumentService } from '../services/clientPriceDocumentService.js';

export const getAllClientPriceDocuments = async (req: Request, res: Response): Promise<any> => {
    try {
        const { counterpartyId, status, search } = req.query;
        const filters: { counterpartyId?: string; status?: string; search?: string } = {};
        if (typeof counterpartyId === 'string' && counterpartyId) filters.counterpartyId = counterpartyId;
        if (typeof status === 'string' && status) filters.status = status;
        if (typeof search === 'string' && search) filters.search = search;

        const docs = await ClientPriceDocumentService.getAll(filters);
        res.json(docs);
    } catch (error: any) {

        console.error('Error in getAllClientPriceDocuments:', error);
        res.status(500).json({ error: error.message || 'Помилка отримання документів цін клієнтів' });
    }
};

export const getClientPriceDocumentById = async (req: Request, res: Response): Promise<any> => {
    try {
        const id = req.params.id as string;
        const doc = await ClientPriceDocumentService.getById(id);
        res.json(doc);
    } catch (error: any) {
        console.error('Error in getClientPriceDocumentById:', error);
        res.status(404).json({ error: error.message || 'Документ не знайдено' });
    }
};

export const prepareClientPriceDocumentItems = async (req: Request, res: Response): Promise<any> => {
    try {
        const counterpartyId = req.query.counterpartyId as string;
        if (!counterpartyId) {
            return res.status(400).json({ error: 'Параметр counterpartyId є обов\'язковим' });
        }
        const data = await ClientPriceDocumentService.prepareItems(counterpartyId);
        res.json(data);
    } catch (error: any) {
        console.error('Error in prepareClientPriceDocumentItems:', error);
        res.status(500).json({ error: error.message || 'Помилка підготовки товарів для клієнта' });
    }
};

export const createClientPriceDocument = async (req: Request, res: Response): Promise<any> => {
    try {
        const userId = (req as any).user?.id;
        const doc = await ClientPriceDocumentService.create(req.body, userId);
        res.status(201).json(doc);
    } catch (error: any) {
        console.error('Error in createClientPriceDocument:', error);
        res.status(400).json({ error: error.message || 'Помилка створення документа' });
    }
};

export const updateClientPriceDocument = async (req: Request, res: Response): Promise<any> => {
    try {
        const id = req.params.id as string;
        const doc = await ClientPriceDocumentService.update(id, req.body);
        res.json(doc);
    } catch (error: any) {
        console.error('Error in updateClientPriceDocument:', error);
        res.status(400).json({ error: error.message || 'Помилка оновлення документа' });
    }
};

export const applyClientPriceDocument = async (req: Request, res: Response): Promise<any> => {
    try {
        const id = req.params.id as string;
        const userId = (req as any).user?.id;
        const doc = await ClientPriceDocumentService.apply(id, userId);
        res.json(doc);
    } catch (error: any) {
        console.error('Error in applyClientPriceDocument:', error);
        res.status(400).json({ error: error.message || 'Помилка проведення документа' });
    }
};

export const unpostClientPriceDocument = async (req: Request, res: Response): Promise<any> => {
    try {
        const id = req.params.id as string;
        const userId = (req as any).user?.id;
        const doc = await ClientPriceDocumentService.unpost(id, userId);
        res.json(doc);
    } catch (error: any) {
        console.error('Error in unpostClientPriceDocument:', error);
        res.status(400).json({ error: error.message || 'Помилка розпроведення документа' });
    }
};

export const deleteClientPriceDocument = async (req: Request, res: Response): Promise<any> => {
    try {
        const id = req.params.id as string;
        await ClientPriceDocumentService.delete(id);
        res.json({ success: true });
    } catch (error: any) {
        console.error('Error in deleteClientPriceDocument:', error);
        res.status(400).json({ error: error.message || 'Помилка видалення документа' });
    }
};

export const copyClientPriceDocument = async (req: Request, res: Response): Promise<any> => {
    try {
        const id = req.params.id as string;
        const userId = (req as any).user?.id;
        const doc = await ClientPriceDocumentService.copy(id, userId);
        res.status(201).json(doc);
    } catch (error: any) {
        console.error('Error in copyClientPriceDocument:', error);
        res.status(400).json({ error: error.message || 'Помилка копіювання документа' });
    }
};

export const getActiveClientDiscounts = async (req: Request, res: Response): Promise<any> => {
    try {
        const counterpartyId = req.params.counterpartyId as string;
        const discounts = await ClientPriceDocumentService.getActiveDiscounts(counterpartyId);
        res.json(discounts);
    } catch (error: any) {
        console.error('Error in getActiveClientDiscounts:', error);
        res.status(500).json({ error: error.message || 'Помилка отримання знижок клієнта' });
    }
};
