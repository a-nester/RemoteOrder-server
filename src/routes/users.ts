import { Router, Response } from 'express';
import { AuthRequest, userAuth } from '../middleware/auth.js';
import pool from '../db.js';
import bcrypt from 'bcryptjs';

const router = Router();

// Middleware to ensure user is admin
const requireAdmin = (req: AuthRequest, res: Response, next: any) => {
    if (!req.user || !req.user.role || req.user.role.toLowerCase() !== 'admin') {
        return res.status(403).json({ error: 'Access denied: Requires admin' });
    }
    next();
};

// UPDATE own preferences
router.put('/me/preferences', userAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { preferences } = req.body;
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // We use jsonb_set or simple replacement. For simplicity, we can just merge or replace.
        // Let's replace the whole preferences object for now, or merge if we want to be safe.
        // A simple full replacement is fine if frontend sends the full object.
        const result = await pool.query(
            'UPDATE "User" SET preferences = $1 WHERE id = $2 RETURNING preferences',
            [preferences || {}, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating preferences:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Apply admin check for the rest of the generic user routes
router.use(userAuth, requireAdmin);

// GET all users
router.get('/', async (req: AuthRequest, res: Response) => {
    try {
        const result = await pool.query(
            'SELECT id, email, role, "warehouseId", "organizationId", "counterpartyId", "preferences", "createdAt", "updatedAt" FROM "User" ORDER BY email ASC'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// CREATE new user
router.post('/', async (req: AuthRequest, res: Response) => {
    try {
        const { email, password, role, counterpartyId, organizationId, warehouseId } = req.body;
        
        if (!email || !password || !role) {
            return res.status(400).json({ error: 'Email, password, and role are required' });
        }

        // Check if exists
        const exists = await pool.query('SELECT id FROM "User" WHERE email = $1', [email]);
        if (exists.rows.length > 0) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const result = await pool.query(
            `INSERT INTO "User" (email, password, role, "counterpartyId", "organizationId", "warehouseId", preferences) 
             VALUES ($1, $2, $3, $4, $5, $6, '{}') 
             RETURNING id, email, role, "warehouseId", "counterpartyId", "organizationId", preferences`,
            [email, hashedPassword, role, counterpartyId || null, organizationId || null, warehouseId || null]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// UPDATE user
router.put('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { email, role, password, counterpartyId, organizationId, warehouseId, preferences } = req.body;

        if (!email || !role) {
            return res.status(400).json({ error: 'Email and role are required' });
        }

        let query = 'UPDATE "User" SET email = $1, role = $2, "counterpartyId" = $3, "organizationId" = $4';
        let values: any[] = [email, role, counterpartyId || null, organizationId || null];
        let paramIndex = 5;

        if (warehouseId !== undefined) {
            query += `, "warehouseId" = $${paramIndex}`;
            values.push(warehouseId || null);
            paramIndex++;
        }

        if (preferences !== undefined) {
            query += `, preferences = $${paramIndex}`;
            values.push(preferences);
            paramIndex++;
        }

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += `, password = $${paramIndex}`;
            values.push(hashedPassword);
            paramIndex++;
        }

        query += ` WHERE id = $${paramIndex}`;
        values.push(id);

        query += ' RETURNING id, email, role, "warehouseId", "counterpartyId", "organizationId", preferences';

        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
