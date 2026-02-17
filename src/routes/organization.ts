import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get Organization Details
router.get('/', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM "Organization" LIMIT 1');
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Organization not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching organization:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update Organization Details
router.put('/', authenticateToken, async (req, res) => {
    const { id, name, fullDetails } = req.body;
    try {
        const result = await pool.query(
            'UPDATE "Organization" SET name = $1, "fullDetails" = $2, "updatedAt" = NOW() WHERE id = $3 RETURNING *',
            [name, fullDetails, id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating organization:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get Warehouses
router.get('/warehouses', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM "Warehouse" WHERE "isDeleted" = FALSE ORDER BY "createdAt" DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching warehouses:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create Warehouse
router.post('/warehouses', authenticateToken, async (req, res) => {
    const { name, address, organizationId } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO "Warehouse" (name, address, "organizationId") VALUES ($1, $2, $3) RETURNING *',
            [name, address, organizationId]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error creating warehouse:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update Warehouse
router.put('/warehouses/:id', authenticateToken, async (req, res) => {
    const { name, address } = req.body;
    const { id } = req.params;
    try {
        const result = await pool.query(
            'UPDATE "Warehouse" SET name = $1, address = $2, "updatedAt" = NOW() WHERE id = $3 RETURNING *',
            [name, address, id]
        );
        if (result.rows.length === 0) return res.status(404).json({ message: 'Warehouse not found' });
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating warehouse:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
