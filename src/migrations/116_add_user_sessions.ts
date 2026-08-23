import pool from '../db.js';

export async function runMigration() {
    try {
        console.log('Running migration: 116_add_user_sessions...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS "UserSession" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "userId" INTEGER,
                "userEmail" VARCHAR(255) NOT NULL,
                "userRole" VARCHAR(50),
                "ipAddress" VARCHAR(100),
                "userAgent" TEXT,
                "device" VARCHAR(255),
                "region" VARCHAR(255),
                "loginTime" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        console.log('Migration 116_add_user_sessions completed successfully.');
    } catch (e) {
        console.error('Migration 116_add_user_sessions failed:', e);
    }
}
