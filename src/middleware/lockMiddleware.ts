import { Request, Response, NextFunction } from 'express';
import pool from '../db.js';

export const lockMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    // Only lock modification commands
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        const protectedPaths = [
            '/api/realizations',
            '/api/goods-receipt',
            '/api/buyer-returns',
            '/api/price-documents',
            '/api/orders'
        ];

        // Is this path protected?
        const isProtected = protectedPaths.some((p) => req.path.startsWith(p));

        if (isProtected) {
            try {
                const result = await pool.query('SELECT "isLocked", "reason" FROM "SystemLock" WHERE id = $1', ['document_operations']);
                if (result.rows.length > 0 && result.rows[0].isLocked) {
                    return res.status(503).json({
                        error: 'System is currently locked for maintenance',
                        reason: result.rows[0].reason || 'Document reposting in progress. Please wait.'
                    });
                }
            } catch (error) {
                console.error('SystemLock check failed:', error);
                // If the check fails (e.g., db down), we could fail-closed. 
                // But typically if the db is down, the operation will fail anyway.
            }
        }
    }

    next();
};
