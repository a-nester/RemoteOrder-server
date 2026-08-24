import pool from '../db.js';
import fs from 'fs';
import path from 'path';

export async function runMigration() {
    try {
        console.log('Running migration: 118_add_product_image_table...');
        
        // 1. Create ProductImage table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS "ProductImage" (
                "filename" VARCHAR(255) PRIMARY KEY,
                "mimeType" VARCHAR(100) NOT NULL,
                "fileData" BYTEA NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // 2. Backfill any existing files from local uploads/ directory into DB table
        const uploadDir = path.join(process.cwd(), 'uploads');
        if (fs.existsSync(uploadDir)) {
            const files = fs.readdirSync(uploadDir);
            for (const file of files) {
                if (file.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
                    const filePath = path.join(uploadDir, file);
                    try {
                        const fileBuffer = fs.readFileSync(filePath);
                        const ext = path.extname(file).toLowerCase();
                        let mimeType = 'image/jpeg';
                        if (ext === '.png') mimeType = 'image/png';
                        else if (ext === '.webp') mimeType = 'image/webp';
                        else if (ext === '.gif') mimeType = 'image/gif';
                        else if (ext === '.svg') mimeType = 'image/svg+xml';

                        await pool.query(
                            `INSERT INTO "ProductImage" ("filename", "mimeType", "fileData")
                             VALUES ($1, $2, $3)
                             ON CONFLICT ("filename") DO NOTHING`,
                            [file, mimeType, fileBuffer]
                        );
                    } catch (readErr) {
                        console.warn(`Could not backfill image ${file}:`, readErr);
                    }
                }
            }
        }

        console.log('Migration 118_add_product_image_table completed successfully.');
    } catch (e) {
        console.error('Migration 118_add_product_image_table failed:', e);
    }
}
