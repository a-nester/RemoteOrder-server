import pool from '../db.js';

export async function runMigration() {
    try {
        console.log('Running migration: 121_add_audit_log_table...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS "AuditLog" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "userId" VARCHAR(255),
                "userName" VARCHAR(255),
                "userRole" VARCHAR(50),
                "action" VARCHAR(50) NOT NULL,
                "entity" VARCHAR(50) NOT NULL,
                "entityId" VARCHAR(255) NOT NULL,
                "oldData" JSONB,
                "newData" JSONB,
                "reason" TEXT,
                "ipAddress" VARCHAR(50),
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS "idx_audit_log_entity" ON "AuditLog"("entity", "entityId");
            CREATE INDEX IF NOT EXISTS "idx_audit_log_user" ON "AuditLog"("userId");
            CREATE INDEX IF NOT EXISTS "idx_audit_log_created_at" ON "AuditLog"("createdAt");
        `);

        // Add soft-delete metadata columns to Realization if missing
        await pool.query(`
            ALTER TABLE "Realization"
            ADD COLUMN IF NOT EXISTS "deletedBy" VARCHAR(255),
            ADD COLUMN IF NOT EXISTS "deleteReason" TEXT;
        `);

        console.log('Migration 121_add_audit_log_table completed successfully.');
    } catch (e) {
        console.error('Migration 121_add_audit_log_table failed:', e);
    }
}
