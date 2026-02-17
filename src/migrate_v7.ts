import pool from './db.js';

async function migrateV7() {
    console.log('🔄 Запуск міграції V7 (Organization & Realization)...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Create Organization table
        console.log('Hammer Creating Organization table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS "Organization" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "name" VARCHAR(255) NOT NULL,
                "fullDetails" TEXT, -- Legal address, IBAN, etc.
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // 2. Create Warehouse table
        console.log('Hammer Creating Warehouse table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS "Warehouse" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "name" VARCHAR(255) NOT NULL,
                "address" TEXT,
                "organizationId" UUID REFERENCES "Organization"("id"),
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "isDeleted" BOOLEAN DEFAULT FALSE
            );
        `);

        // 3. Update Counterparty table
        console.log('Hammer Updating Counterparty table...');
        await client.query(`
            ALTER TABLE "Counterparty" 
            ADD COLUMN IF NOT EXISTS "warehouseId" UUID REFERENCES "Warehouse"("id");
        `);

        // 4. Create Realization table
        console.log('Hammer Creating Realization table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS "Realization" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "date" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                "number" VARCHAR(50) NOT NULL, -- Document number
                "counterpartyId" UUID REFERENCES "Counterparty"("id"),
                "warehouseId" UUID REFERENCES "Warehouse"("id"),
                "status" VARCHAR(50) NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'POSTED', 'CANCELED'
                "amount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
                "currency" VARCHAR(10) NOT NULL DEFAULT 'UAH',
                "comment" TEXT,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                "createdBy" TEXT, -- User ID
                "isDeleted" BOOLEAN DEFAULT FALSE
            );
        `);

        // 5. Create RealizationItem table
        console.log('Hammer Creating RealizationItem table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS "RealizationItem" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "realizationId" UUID NOT NULL REFERENCES "Realization"("id") ON DELETE CASCADE,
                "productId" TEXT NOT NULL, -- References Product (which is TEXT id currently)
                "quantity" DECIMAL(10, 3) NOT NULL,
                "price" DECIMAL(10, 2) NOT NULL,
                "total" DECIMAL(10, 2) NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // 6. Indexes
        console.log('🔍 Creating indexes...');
        await client.query(`CREATE INDEX IF NOT EXISTS "Realization_counterpartyId_idx" ON "Realization"("counterpartyId");`);
        await client.query(`CREATE INDEX IF NOT EXISTS "Realization_date_idx" ON "Realization"("date");`);
        await client.query(`CREATE INDEX IF NOT EXISTS "RealizationItem_realizationId_idx" ON "RealizationItem"("realizationId");`);

        // 7. Seed Default Data
        console.log('🌱 Seeding default Organization and Warehouse...');

        // Check if Org exists
        const orgRes = await client.query(`SELECT id FROM "Organization" LIMIT 1`);
        let orgId;

        if (orgRes.rowCount === 0) {
            const newOrg = await client.query(`
                INSERT INTO "Organization" (name) VALUES ('МілКрай') RETURNING id;
            `);
            orgId = newOrg.rows[0].id;
            console.log(`Created Organization: МілКрай (${orgId})`);
        } else {
            orgId = orgRes.rows[0].id;
        }

        // Check if Warehouse exists
        const whRes = await client.query(`SELECT id FROM "Warehouse" WHERE "organizationId" = $1 LIMIT 1`, [orgId]);
        if (whRes.rowCount === 0) {
            await client.query(`
                INSERT INTO "Warehouse" (name, "organizationId") VALUES ('Основний склад', $1);
            `, [orgId]);
            console.log(`Created Warehouse: Основний склад`);
        }

        await client.query('COMMIT');
        console.log('🎉 Міграція V7 завершена успішно!');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Помилка міграції:', error);
        throw error;
    } finally {
        client.release();
        // Since this is a script, we might want to exit explicitly or let the pool close naturally if imported.
        // But typically for one-off scripts:
        process.exit(0);
    }
}

migrateV7();
