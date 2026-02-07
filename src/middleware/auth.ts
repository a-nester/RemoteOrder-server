import { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'secret';

export const adminAuth = (req: Request, res: Response, next: NextFunction) => {
    const secret = req.headers['x-admin-secret'];

    if (!secret || secret !== ADMIN_SECRET) {
        return res.status(403).json({ error: 'Access denied. Invalid admin secret.' });
    }

    next();
};
