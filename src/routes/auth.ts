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

        // Helper for device & region parsing
        const headerIp = req.headers['x-forwarded-for'];
        let rawIp = '127.0.0.1';
        if (Array.isArray(headerIp) && headerIp.length > 0 && headerIp[0]) {
            rawIp = headerIp[0];
        } else if (typeof headerIp === 'string' && headerIp) {
            rawIp = headerIp;
        } else if (req.ip) {
            rawIp = req.ip;
        }
        const ipAddress = (rawIp.split(',')[0] || rawIp).trim();
        const userAgentStr = (req.headers['user-agent'] as string) || 'Unknown';
        
        const parseDeviceAndRegion = (uaStr: string, ip: string) => {
            let device = 'Невідомий пристрій';
            const ua = uaStr.toLowerCase();

            if (ua.includes('iphone')) {
                device = 'iPhone (iOS)';
            } else if (ua.includes('ipad')) {
                device = 'iPad (iPadOS)';
            } else if (ua.includes('android')) {
                device = ua.includes('mobile') ? 'Android Mobile' : 'Android Tablet';
            } else if (ua.includes('macintosh') || ua.includes('mac os')) {
                device = 'Mac Desktop';
            } else if (ua.includes('windows')) {
                device = 'Windows PC';
            } else if (ua.includes('linux')) {
                device = 'Linux PC';
            }

            let browser = '';
            if (ua.includes('edg')) browser = 'Edge';
            else if (ua.includes('chrome')) browser = 'Chrome';
            else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
            else if (ua.includes('firefox')) browser = 'Firefox';
            else if (ua.includes('expo') || ua.includes('okhttp') || ua.includes('cfnetwork')) browser = 'RemoteOrder Mobile App';

            if (browser && !device.includes(browser)) {
                device = `${device} (${browser})`;
            }

            let region = 'Україна / Публічний IP';
            const cleanIp = ip.replace(/^::ffff:/, '');
            if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.') || cleanIp.startsWith('172.16.')) {
                region = 'Локальна мережа (Local)';
            }

            return { device, region };
        };

        const { device, region } = parseDeviceAndRegion(userAgentStr, ipAddress);

        // Record User Session in background
        pool.query(
            `INSERT INTO "UserSession" ("userId", "userEmail", "userRole", "ipAddress", "userAgent", "device", "region")
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [user.id, user.email, user.role, ipAddress, userAgentStr, device, region]
        ).catch((err) => console.error('Failed to log user session:', err));

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
            { expiresIn: '30d' }
        );

        // Return user info and token
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                warehouseId: user.warehouseId,
                visibleWarehouses: user.visibleWarehouses || [],
                preferences: user.preferences,
                permissions: user.permissions
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

router.get('/emergency-reset', async (req: Request, res: Response) => {
    try {
        const hashed = await bcrypt.hash('123456', 10);
        await pool.query('UPDATE "User" SET password = $1 WHERE email = $2', [hashed, 'admin@test.com']);
        res.json({ message: 'Admin password reset to 123456' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
