import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: "postgresql://remoteorder_user:wDJme334tcPVfpgd0ozQduahRKHgHsBS@dpg-d63kbnq4d50c73dpj6i0-a.oregon-postgres.render.com/remoteorder",
  ssl: { rejectUnauthorized: false }
});

const createTables = async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log("Creating AccessLog/SyncLog table if missing..."); 
        await client.query(`
            CREATE TABLE IF NOT EXISTS "SyncLog" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "userId" TEXT NOT NULL,
                "action" TEXT NOT NULL,
                "table" TEXT NOT NULL,
                "recordId" TEXT NOT NULL,
                "data" JSONB,
                "synced" BOOLEAN DEFAULT false,
                "createdAt" TIMESTAMPTZ DEFAULT NOW(),
                "updatedAt" TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        console.log("Creating Order table...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS "Order" (
                "id" TEXT PRIMARY KEY,
                "userId" TEXT NOT NULL,
                "status" TEXT DEFAULT 'NEW',
                "total" DECIMAL(10, 2) DEFAULT 0,
                "currency" TEXT DEFAULT 'UAH',
                "items" JSONB,
                "comment" TEXT,
                "docNumber" TEXT,
                "createdAt" TIMESTAMPTZ DEFAULT NOW(),
                "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
                "deleted" BOOLEAN DEFAULT false
            );
        `);

        console.log("Creating OrderItem table...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS "OrderItem" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "orderId" TEXT NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE,
                "productId" TEXT NOT NULL,
                "quantity" INTEGER NOT NULL,
                "sellPrice" DECIMAL(10, 2) NOT NULL,
                "createdAt" TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        console.log("Creating OrderItemBatch table...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS "OrderItemBatch" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "orderItemId" UUID NOT NULL REFERENCES "OrderItem"("id") ON DELETE CASCADE,
                "productBatchId" TEXT NOT NULL,
                "quantity" INTEGER NOT NULL,
                "enterPrice" DECIMAL(10, 2) NOT NULL,
                "createdAt" TIMESTAMPTZ DEFAULT NOW()
            );
        `);

        await client.query('COMMIT');
        console.log("✅ Tables created successfully.");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("❌ Error creating tables:", e);
    } finally {
        client.release();
        pool.end();
    }
};

createTables();
