import pool from './db.js';
import bcrypt from 'bcryptjs';

async function migrateUsers() {
    const client = await pool.connect();
    try {
        console.log('🔄 Starting User Table Migration...');
        await client.query('BEGIN');

        // 0. Drop existing table if exists (since it has wrong schema and is empty)
        await client.query('DROP TABLE IF EXISTS "User" CASCADE');

        // 1. Create User table
        await client.query(`
            CREATE TABLE IF NOT EXISTS "User" (
                "id" SERIAL PRIMARY KEY,
                "email" TEXT UNIQUE NOT NULL,
                "password" TEXT NOT NULL,
                "role" TEXT NOT NULL DEFAULT 'client', -- 'admin', 'manager', 'client'
                "warehouseId" TEXT,
                "visibleWarehouses" JSONB NOT NULL DEFAULT '[]'::jsonb,
                "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `);

        // 2. Seed initial admin user
        const adminEmail = 'admin@test.com';
        const adminPassword = 'secure-admin-password'; // Change this in production
        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        // Check if admin exists
        const res = await client.query('SELECT * FROM "User" WHERE email = $1', [adminEmail]);
        if (res.rows.length === 0) {
            await client.query(`
                INSERT INTO "User" ("email", "password", "role")
                VALUES ($1, $2, 'admin')
            `, [adminEmail, hashedPassword]);
            console.log(`✅ Created default admin user: ${adminEmail}`);
        } else {
            console.log(`ℹ️ Admin user already exists.`);
        }

        // Seed other mock users from frontend for compatibility
        const users = [
            { email: "manager@test.com", password: "123456", role: "manager", warehouseId: "1" },
            { email: "client@test.com", password: "123456", role: "client", warehouseId: "1" },
            { email: "manager2@test.com", password: "123456", role: "manager", warehouseId: "2" },
            { email: "client2@test.com", password: "123456", role: "client", warehouseId: "2" },
            { email: "ternopil@test.com", password: "123456", role: "manager", warehouseId: "1" },
        ];

        for (const user of users) {
            const exists = await client.query('SELECT * FROM "User" WHERE email = $1', [user.email]);
            if (exists.rows.length === 0) {
                const hashed = await bcrypt.hash(user.password, 10);
                await client.query(`
                    INSERT INTO "User" ("email", "password", "role", "warehouseId")
                    VALUES ($1, $2, $3, $4)
                 `, [user.email, hashed, user.role, user.warehouseId]);
                console.log(`✅ Created user: ${user.email}`);
            }
        }

        await client.query('COMMIT');
        console.log('🎉 User Migration completed successfully!');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrateUsers();
