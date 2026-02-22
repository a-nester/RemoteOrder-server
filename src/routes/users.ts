import { Router, Response } from 'express';
import { AuthRequest, userAuth } from '../middleware/auth.js';
import pool from '../db.js';
import bcrypt from 'bcryptjs';

const router = Router();

// Middleware to ensure user is admin
const requireAdmin = (req: AuthRequest, res: Response, next: any) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied: Requires admin' });
    }
    next();
};

// Apply auth first, then admin check
router.use(userAuth);
router.use(requireAdmin);

// GET all users
router.get('/', async (req: AuthRequest, res: Response) => {
    try {
        const result = await pool.query(
            'SELECT id, email, role, "warehouseId", "organizationId", "counterpartyId", "createdAt", "updatedAt" FROM "User" ORDER BY email ASC'
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
        const { email, password, role, counterpartyId, organizationId } = req.body;
        
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
            `INSERT INTO "User" (email, password, role, "counterpartyId", "organizationId") 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING id, email, role, "warehouseId", "counterpartyId", "organizationId"`,
            [email, hashedPassword, role, counterpartyId || null, organizationId || null]
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
        const { email, role, password, counterpartyId, organizationId } = req.body;

        if (!email || !role) {
            return res.status(400).json({ error: 'Email and role are required' });
        }

        let query = 'UPDATE "User" SET email = $1, role = $2, "counterpartyId" = $3, "organizationId" = $4';
        let values: any[] = [email, role, counterpartyId || null, organizationId || null];

        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += ', password = $5';
            values.push(hashedPassword);
            values.push(id);
            query += ' WHERE id = $6';
        } else {
            values.push(id);
            query += ' WHERE id = $5';
        }

        query += ' RETURNING id, email, role, "warehouseId", "counterpartyId", "organizationId"';

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
