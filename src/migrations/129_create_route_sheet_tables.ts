import pool from '../db.js';

export async function runMigration() {
    try {
        console.log('Running migration: 129_create_route_sheet_tables...');
        await pool.query(`
            CREATE TABLE IF NOT EXISTS "RouteSheet" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "number" VARCHAR(50) NOT NULL UNIQUE,
                "date" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "status" VARCHAR(20) DEFAULT 'DRAFT',
                "driverName" VARCHAR(255),
                "comment" TEXT,
                "totalAmount" DECIMAL(12, 2) DEFAULT 0,
                "totalPayment" DECIMAL(12, 2) DEFAULT 0,
                "createdBy" INT REFERENCES "User"("id"),
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "isDeleted" BOOLEAN DEFAULT FALSE
            );

            CREATE TABLE IF NOT EXISTS "RouteSheetItem" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "routeSheetId" UUID NOT NULL REFERENCES "RouteSheet"("id") ON DELETE CASCADE,
                "realizationId" UUID NOT NULL REFERENCES "Realization"("id") ON DELETE CASCADE,
                "clientPayment" DECIMAL(12, 2) DEFAULT 0,
                "comment" TEXT,
                "sortOrder" INT DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS "idx_routesheet_date" ON "RouteSheet"("date");
            CREATE INDEX IF NOT EXISTS "idx_routesheet_status" ON "RouteSheet"("status");
            CREATE INDEX IF NOT EXISTS "idx_routesheet_is_deleted" ON "RouteSheet"("isDeleted");
            CREATE INDEX IF NOT EXISTS "idx_routesheet_item_rs" ON "RouteSheetItem"("routeSheetId");
            CREATE INDEX IF NOT EXISTS "idx_routesheet_item_rel" ON "RouteSheetItem"("realizationId");
        `);

        console.log('Migration 129_create_route_sheet_tables completed successfully.');
    } catch (e) {
        console.error('Migration 129_create_route_sheet_tables failed:', e);
    }
}
