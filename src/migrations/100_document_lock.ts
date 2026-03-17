import pool from '../db.js';

export const runMigration = async () => {
    const client = await pool.connect();
    try {
        console.log('Running migration: Create DocumentLock table');
        await client.query(`
            CREATE TABLE IF NOT EXISTS "DocumentLock" (
                "id" VARCHAR(50) PRIMARY KEY,
                "isLocked" BOOLEAN NOT NULL DEFAULT false,
                "lockedBy" VARCHAR(255),
                "lockedAt" TIMESTAMP,
                "reason" TEXT
            );

            -- Ensure exactly one row exists for the document lock
            INSERT INTO "DocumentLock" ("id", "isLocked")
            VALUES ('document_operations', false)
            ON CONFLICT ("id") DO NOTHING;
        `);
        console.log('Migration successful: DocumentLock created');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        client.release();
    }
};
