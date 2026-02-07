import { Router, Request, Response } from 'express';
import pool from '../db.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { adminAuth } from '../middleware/auth.js';

const router = Router();

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/';
        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Apply admin auth to all routes in this router
router.use(adminAuth);

// ➕ Create Product
router.post('/products', upload.array('photos', 5), async (req: Request, res: Response) => {
    try {
        const { name, unit, category, prices } = req.body;
        const files = req.files as Express.Multer.File[];
        const photoUrls = files ? files.map(file => `/uploads/${file.filename}`) : [];

        // Parse prices if sent as string (e.g. from FormData)
        let parsedPrices = prices;
        if (typeof prices === 'string') {
            try {
                parsedPrices = JSON.parse(prices);
            } catch (e) {
                parsedPrices = { standard: 0 };
            }
        }

        const result = await pool.query(
            `INSERT INTO "Product" ("name", "unit", "category", "prices", "photos")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
            [name, unit, category, JSON.stringify(parsedPrices), photoUrls]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({ error: 'Failed to create product' });
    }
});

// ✏️ Update Product
router.put('/products/:id', upload.array('photos', 5), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, unit, category, prices, existingPhotos } = req.body;
        const files = req.files as Express.Multer.File[];

        const newPhotoUrls = files ? files.map(file => `/uploads/${file.filename}`) : [];

        // Parse prices
        let parsedPrices = prices;
        if (typeof prices === 'string') {
            try {
                parsedPrices = JSON.parse(prices);
            } catch (e) {
                // keep existing if invalid? or default. 
            }
        }

        // Handle photos: combine existing (kept) + new
        let finalPhotos = newPhotoUrls;
        if (existingPhotos) {
            const keptPhotos = Array.isArray(existingPhotos) ? existingPhotos : [existingPhotos];
            finalPhotos = [...keptPhotos, ...newPhotoUrls];
        }

        // Dynamic update query construction
        // Simple version: update all fields (assuming they are provided)
        // For a robust implementation, we should check which fields are present.
        // For now, assuming the admin UI sends full object or we use COALESCE.

        const query = `
      UPDATE "Product"
      SET "name" = COALESCE($2, "name"),
          "unit" = COALESCE($3, "unit"),
          "category" = COALESCE($4, "category"),
          "prices" = COALESCE($5, "prices"),
          "photos" = COALESCE($6, "photos"),
          "updatedAt" = NOW()
      WHERE "id" = $1
      RETURNING *
    `;

        const result = await pool.query(query, [
            id,
            name,
            unit,
            category,
            parsedPrices ? JSON.stringify(parsedPrices) : null,
            finalPhotos.length > 0 ? finalPhotos : null // If no photos provided/kept, COALESCE keeps existing? No, COALESCE($6, "photos") works if $6 is null. 
            // Issue: If I want to delete all photos, I should send empty array. But empty array is not null.
            // Adjust logic: if existingPhotos and files are undefined/null, don't update photos?
            // Or explicit "deletePhotos" action?
            // Let's assume frontend sends the final list of photos logic slightly differently or we just update if 'photos' field is implicitly handled.
            // Better approach for PUT: replace the collection.
        ]);

        // Let's refine the photo logic for PUT to be "Replace photos with provided list" + "Add new uploaded files".
        // If the user wants to keep old photos, they must send them in 'existingPhotos'.
        // If 'existingPhotos' is missing, it implies "remove old photos" (if we follow strict PUT), 
        // BUT since we have file upload, it's tricky.
        // Let's stick to: finalPhotos = (existingPhotos || []) + newFiles.

        const updatePhotos = existingPhotos || files.length > 0;

        let dbResult;

        if (updatePhotos) {
            dbResult = await pool.query(`
            UPDATE "Product"
            SET "name" = $2, "unit" = $3, "category" = $4, "prices" = $5, "photos" = $6, "updatedAt" = NOW()
            WHERE "id" = $1 RETURNING *`,
                [id, name, unit, category, JSON.stringify(parsedPrices), finalPhotos]
            );
        } else {
            // Don't update photos
            dbResult = await pool.query(`
            UPDATE "Product"
            SET "name" = $2, "unit" = $3, "category" = $4, "prices" = $5, "updatedAt" = NOW()
            WHERE "id" = $1 RETURNING *`,
                [id, name, unit, category, JSON.stringify(parsedPrices)]
            );
        }

        res.json(dbResult.rows[0]);
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// ❌ Delete Product (Soft Delete)
router.delete('/products/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await pool.query('UPDATE "Product" SET "deleted" = true, "updatedAt" = NOW() WHERE "id" = $1', [id]);
        res.json({ success: true, message: 'Product deleted' });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

export default router;
