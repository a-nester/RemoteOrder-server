import { Router, Request, Response } from 'express';
import pool from '../db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();
const JWT_SECRET: string = process.env.JWT_SECRET || 'your-secret-key'; // Should be in env

// Login Route
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Find user
        const result = await pool.query('SELECT * FROM "User" WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate Token
        // Payload matches the frontend User type roughly
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role,
                warehouseId: user.warehouseId
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Return user info and token
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                warehouseId: user.warehouseId
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Verify Token (Optional, for client to check validity)
router.get('/verify', async (req: Request, res: Response) => {
    // This will be protected by middleware in the main app, but we can double check here
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ valid: false });

        jwt.verify(token, JWT_SECRET);
        res.json({ valid: true });
    } catch (e) {
        res.status(401).json({ valid: false });
    }
});

export default router;
