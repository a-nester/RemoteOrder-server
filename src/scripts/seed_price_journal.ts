import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') }); // Adjusted relative path to reach RemoteOrderSrv root

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function seedPriceJournal() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('Running bulk insert into PriceJournal...');
        
        const bulkInsertQuery = `
            INSERT INTO "PriceJournal" (
                "productId", "priceTypeId", "oldPrice", "newPrice", 
                "effectiveDate", "createdBy", "reason", "createdAt"
            )
            SELECT 
                p.id as "productId", 
                pt.id as "priceTypeId", 
                NULL as "oldPrice", 
                CAST(jsonb_extract_path_text(p.prices, pt.slug) AS DECIMAL) as "newPrice",
                NOW() as "effectiveDate",
                NULL as "createdBy",
                'Initial migration data' as "reason",
                NOW() as "createdAt"
            FROM "Product" p
            CROSS JOIN "PriceType" pt
            WHERE p.prices IS NOT NULL 
            AND p.prices ? pt.slug
            AND jsonb_extract_path_text(p.prices, pt.slug) ~ '^[0-9]+(\\.[0-9]+)?$'
            AND NOT EXISTS (
                SELECT 1 FROM "PriceJournal" pj 
                WHERE pj."productId" = p.id 
                AND pj."priceTypeId" = pt.id 
                AND pj.reason = 'Initial migration data'
            )
        `;

        const result = await client.query(bulkInsertQuery);
        await client.query('COMMIT');
        
        console.log(`✅ Successfully seeded ${result.rowCount} initial prices into PriceJournal using bulk SQL.`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration error:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

seedPriceJournal();
