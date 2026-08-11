import { Router, Response } from 'express';
import { AuthRequest, userAuth, adminAuth } from '../middleware/auth.js';
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
router.use(adminAuth);

// GET all users
router.get('/', async (req: AuthRequest, res: Response) => {
    try {
        const result = await pool.query('SELECT id, email, role, "warehouseId", "visibleWarehouses", "visibleTerritories", "visiblePriceTypes", "counterpartyId", "organizationId", "preferences", "permissions", "createdAt", "updatedAt" FROM "User" ORDER BY email ASC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching users with visibleWarehouses:', error);
        try {
            // Fallback for missing visibleWarehouses column
            const fallbackResult = await pool.query('SELECT id, email, role, "warehouseId", "counterpartyId", "organizationId", "preferences", "permissions", "createdAt", "updatedAt" FROM "User" ORDER BY email ASC');
            const rows = fallbackResult.rows.map(user => ({
                ...user,
                visibleWarehouses: []
            }));
            res.json(rows);
        } catch (fallbackError) {
            console.error('Error fetching users (fallback):', fallbackError);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

// CREATE new user
router.post('/', async (req: AuthRequest, res: Response) => {
    try {
        let { email, password, role, counterpartyId, organizationId, warehouseId, visibleWarehouses, visibleTerritories, visiblePriceTypes, permissions } = req.body as any;
        
        if (!email || !password || !role) {
            return res.status(400).json({ error: 'Email, password, and role are required' });
        }
        
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (warehouseId && !uuidRegex.test(warehouseId)) {
            warehouseId = null;
        }

        // Check if exists
        const exists = await pool.query('SELECT id FROM "User" WHERE email = $1', [email]);
        if (exists.rows.length > 0) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const result = await pool.query(
            `INSERT INTO "User" (email, password, role, "counterpartyId", "organizationId", "warehouseId", "visibleWarehouses", "visibleTerritories", "visiblePriceTypes", preferences, permissions) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '{}', $10) 
             RETURNING id, email, role, "warehouseId", "visibleWarehouses", "visibleTerritories", "visiblePriceTypes", "counterpartyId", "organizationId", preferences, permissions`,
            [email, hashedPassword, role, counterpartyId || null, organizationId || null, warehouseId || null, JSON.stringify(visibleWarehouses || []), JSON.stringify(visibleTerritories || []), JSON.stringify(visiblePriceTypes || []), permissions || {}]
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
        let { email, role, password, counterpartyId, organizationId, warehouseId, visibleWarehouses, visibleTerritories, visiblePriceTypes, preferences, permissions } = req.body as any;

        if (!email || !role) {
            return res.status(400).json({ error: 'Email and role are required' });
        }
        
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (warehouseId && !uuidRegex.test(warehouseId)) {
            warehouseId = null;
        }

        let hashedPassword: string | undefined;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        const executeUpdate = async (includeVisibleFields: boolean) => {
            let query = 'UPDATE "User" SET email = $1, role = $2, "counterpartyId" = $3, "organizationId" = $4';
            let values: any[] = [email, role, counterpartyId || null, organizationId || null];
            let paramIndex = 5;

            if (warehouseId !== undefined) {
                query += `, "warehouseId" = $${paramIndex}`;
                values.push(warehouseId || null);
                paramIndex++;
            }
            
            if (includeVisibleFields && visibleWarehouses !== undefined) {
                query += `, "visibleWarehouses" = $${paramIndex}`;
                values.push(JSON.stringify(visibleWarehouses || []));
                paramIndex++;
            }

            if (includeVisibleFields && visibleTerritories !== undefined) {
                query += `, "visibleTerritories" = $${paramIndex}`;
                values.push(JSON.stringify(visibleTerritories || []));
                paramIndex++;
            }

            if (includeVisibleFields && visiblePriceTypes !== undefined) {
                query += `, "visiblePriceTypes" = $${paramIndex}`;
                values.push(JSON.stringify(visiblePriceTypes || []));
                paramIndex++;
            }

            if (preferences !== undefined) {
                query += `, preferences = $${paramIndex}`;
                values.push(preferences);
                paramIndex++;
            }

            if (permissions !== undefined) {
                query += `, permissions = $${paramIndex}`;
                values.push(permissions);
                paramIndex++;
            }

            if (hashedPassword) {
                query += `, password = $${paramIndex}`;
                values.push(hashedPassword);
                paramIndex++;
            }

            query += ` WHERE id = $${paramIndex}`;
            values.push(id);

            const returningCols = includeVisibleFields
                ? 'id, email, role, "warehouseId", "visibleWarehouses", "visibleTerritories", "visiblePriceTypes", "counterpartyId", "organizationId", preferences, permissions'
                : 'id, email, role, "warehouseId", "counterpartyId", "organizationId", preferences, permissions';

            query += ` RETURNING ${returningCols}`;
            return await pool.query(query, values);
        };

        let result;
        try {
            result = await executeUpdate(true);
        } catch (err: any) {
            // Fallback if visibleWarehouses column is missing in DB
            if (err.code === '42703') {
                console.warn('visibleWarehouses column missing, falling back to basic update...');
                result = await executeUpdate(false);
                if (result.rows.length > 0) {
                    result.rows[0].visibleWarehouses = [];
                }
            } else {
                throw err;
            }
        }

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
