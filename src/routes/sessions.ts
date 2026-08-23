import { Router, Request, Response } from 'express';
import pool from '../db.js';
import { userAuth, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Require auth for all sessions routes
router.use(userAuth);

// GET /api/service/sessions
router.get('/', async (req: Request, res: Response) => {
    try {
        const user = (req as AuthRequest).user;
        if (user && user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin rights required.' });
        }

        const { search, role, dateFrom, dateTo, limit = 50, offset = 0 } = req.query;

        let params: any[] = [];
        let whereClauses: string[] = ['1=1'];

        if (search) {
            params.push(`%${search}%`);
            whereClauses.push(`("userEmail" ILIKE $${params.length} OR "ipAddress" ILIKE $${params.length} OR "device" ILIKE $${params.length} OR "region" ILIKE $${params.length})`);
        }

        if (role && role !== 'ALL') {
            params.push(role);
            whereClauses.push(`"userRole" = $${params.length}`);
        }

        if (dateFrom) {
            params.push(dateFrom);
            whereClauses.push(`"loginTime" >= $${params.length}::date`);
        }

        if (dateTo) {
            params.push(dateTo);
            whereClauses.push(`"loginTime" < ($${params.length}::date + interval '1 day')`);
        }

        const whereSql = whereClauses.join(' AND ');

        // Total count query
        const countResult = await pool.query(
            `SELECT COUNT(*) as total FROM "UserSession" WHERE ${whereSql}`,
            params
        );
        const total = parseInt(countResult.rows[0].total, 10);

        // Fetch paginated sessions
        const limitNum = Math.min(Number(limit) || 50, 200);
        const offsetNum = Number(offset) || 0;

        params.push(limitNum, offsetNum);
        const limitParamIndex = params.length - 1;
        const offsetParamIndex = params.length;

        const result = await pool.query(
            `SELECT "id", "userId", "userEmail", "userRole", "ipAddress", "userAgent", "device", "region", "loginTime"
             FROM "UserSession"
             WHERE ${whereSql}
             ORDER BY "loginTime" DESC
             LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
            params
        );

        res.json({
            sessions: result.rows,
            total,
            limit: limitNum,
            offset: offsetNum
        });
    } catch (error) {
        console.error('Error fetching user sessions:', error);
        res.status(500).json({ error: 'Failed to fetch user sessions' });
    }
});

export default router;
