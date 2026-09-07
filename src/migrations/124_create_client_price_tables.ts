import pool from '../db.js';

export async function runMigration() {
    try {
        console.log('Running migration: 124_create_client_price_tables...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS "ClientPriceDocument" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "number" VARCHAR(50) NOT NULL UNIQUE,
                "date" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "counterpartyId" UUID NOT NULL REFERENCES "Counterparty"("id"),
                "priceTypeId" UUID REFERENCES "PriceType"("id"),
                "status" VARCHAR(20) DEFAULT 'DRAFT',
                "comment" TEXT,
                "createdBy" INT REFERENCES "User"("id"),
                "postedBy" INT REFERENCES "User"("id"),
                "postedAt" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "isDeleted" BOOLEAN DEFAULT false
            );

            CREATE TABLE IF NOT EXISTS "ClientPriceDocumentItem" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "documentId" UUID NOT NULL REFERENCES "ClientPriceDocument"("id") ON DELETE CASCADE,
                "productId" UUID NOT NULL REFERENCES "Product"("id"),
                "costPrice" DECIMAL(15, 2) DEFAULT 0,
                "basePrice" DECIMAL(15, 2) DEFAULT 0,
                "discountPercent" DECIMAL(5, 2) DEFAULT 0,
                "finalPrice" DECIMAL(15, 2) DEFAULT 0,
                "sortOrder" INT DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS "CounterpartyDiscountMatrix" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "counterpartyId" UUID NOT NULL REFERENCES "Counterparty"("id") ON DELETE CASCADE,
                "productId" UUID NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
                "discountPercent" DECIMAL(5, 2) NOT NULL DEFAULT 0,
                "documentId" UUID REFERENCES "ClientPriceDocument"("id") ON DELETE SET NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                CONSTRAINT "uq_counterparty_product_discount" UNIQUE ("counterpartyId", "productId")
            );

            CREATE INDEX IF NOT EXISTS "idx_client_pd_counterparty" ON "ClientPriceDocument"("counterpartyId");
            CREATE INDEX IF NOT EXISTS "idx_client_pd_status" ON "ClientPriceDocument"("status");
            CREATE INDEX IF NOT EXISTS "idx_client_pdi_doc" ON "ClientPriceDocumentItem"("documentId");
            CREATE INDEX IF NOT EXISTS "idx_counterparty_discount_lookup" ON "CounterpartyDiscountMatrix"("counterpartyId", "productId");
        `);

        console.log('Migration 124_create_client_price_tables completed successfully.');
    } catch (e) {
        console.error('Migration 124_create_client_price_tables failed:', e);
    }
}
