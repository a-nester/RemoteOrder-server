import pool from '../db.js';

async function runMigration() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('Running migration: Add Finance Tables...');

        // 1. Create Cashbox
        await client.query(`
            CREATE TABLE IF NOT EXISTS "Cashbox" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "name" VARCHAR(255) NOT NULL,
                "type" VARCHAR(50) NOT NULL DEFAULT 'CASH', -- CASH, BANK_ACCOUNT, MANAGER
                "currency" VARCHAR(10) NOT NULL DEFAULT 'UAH',
                "organizationId" UUID,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Create TransactionCategory
        await client.query(`
            CREATE TABLE IF NOT EXISTS "TransactionCategory" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "name" VARCHAR(255) NOT NULL,
                "type" VARCHAR(50) NOT NULL, -- INCOME, OUTCOME, BOTH
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Seed some basic categories if empty
        const catCheck = await client.query('SELECT count(*) FROM "TransactionCategory"');
        if (parseInt(catCheck.rows[0].count) === 0) {
             await client.query(`
                 INSERT INTO "TransactionCategory" ("name", "type")
                 VALUES 
                    ('Оплата від клієнта', 'INCOME'),
                    ('Оплата постачальнику', 'OUTCOME'),
                    ('Витрати банку', 'OUTCOME'),
                    ('Оренда', 'OUTCOME'),
                    ('Зарплата', 'OUTCOME'),
                    ('Інші доходи', 'INCOME'),
                    ('Транспортні витрати', 'OUTCOME')
             `);
             console.log('Seeded initial transaction categories');
        }

        // 3. Create CashTransaction
        await client.query(`
            CREATE TABLE IF NOT EXISTS "CashTransaction" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "number" VARCHAR(50) NOT NULL,
                "type" VARCHAR(50) NOT NULL, -- INCOME or OUTCOME
                "cashboxId" UUID NOT NULL REFERENCES "Cashbox"("id") ON DELETE RESTRICT,
                "amount" DECIMAL(10,2) NOT NULL,
                "categoryId" UUID REFERENCES "TransactionCategory"("id") ON DELETE SET NULL,
                "counterpartyId" UUID REFERENCES "Counterparty"("id") ON DELETE SET NULL,
                "comment" TEXT,
                "createdBy" INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
                "isDeleted" BOOLEAN NOT NULL DEFAULT FALSE,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 4. Modify Realization Document to track paid amount
        const resColumns = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'Realization' AND column_name = 'paidAmount'
        `);
        if (resColumns.rowCount === 0) {
            await client.query(`ALTER TABLE "Realization" ADD COLUMN "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0`);
            console.log('Added paidAmount column to Realization table');
        }

        // 5. Modify GoodsReceipt Document to track paid amount
        const gResColumns = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'GoodsReceipt' AND column_name = 'paidAmount'
        `);
        if (gResColumns.rowCount === 0) {
            await client.query(`ALTER TABLE "GoodsReceipt" ADD COLUMN "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0`);
            console.log('Added paidAmount column to GoodsReceipt table');
        }

        // 6. Create PaymentAllocation
        await client.query(`
            CREATE TABLE IF NOT EXISTS "PaymentAllocation" (
                "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                "cashTransactionId" UUID NOT NULL REFERENCES "CashTransaction"("id") ON DELETE CASCADE,
                "documentId" UUID NOT NULL, -- Can point to Realization or GoodsReceipt
                "documentType" VARCHAR(50) NOT NULL, -- 'REALIZATION' or 'GOODS_RECEIPT'
                "amount" DECIMAL(10,2) NOT NULL,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query('COMMIT');
        console.log('Migration successful: Finance tables added');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

runMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
