import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET: string = process.env.JWT_SECRET || 'your-secret-key';
const ADMIN_SECRET = process.env.ADMIN_SECRET; // Legacy support if needed, but we should move away

export interface AuthRequest extends Request {
    user?: any;
}

export const adminAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
    // 1. Try JWT
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET) as any;
                if (decoded.role === 'admin' || decoded.role === 'manager') {
                    // For now, allow admin role. 
                    if (decoded.role === 'admin') {
                        req.user = decoded;
                        return next();
                    }
                }
            } catch (e) {
                // Token invalid, ignore and try legacy secret or fail
            }
        }
    }

    // 2. Legacy Admin Secret
    const secret = req.headers['x-admin-secret'];
    if (secret && secret === ADMIN_SECRET) {
        req.user = { role: 'admin' }; // Mock admin user from secret
        return next();
    }

    return res.status(403).json({ error: 'Access denied. Valid token or admin secret required.' });
};

export const userAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Token missing' });

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            return next();
        } catch (e) {
            return res.status(401).json({ error: 'Invalid token' });
        }
    }
    return res.status(401).json({ error: 'Authorization header required' });
};
