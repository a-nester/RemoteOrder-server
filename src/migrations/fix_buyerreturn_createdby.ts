import { Pool } from 'pg';

export async function up(pool: Pool) {
  await pool.query(`
    ALTER TABLE "BuyerReturn" 
    ALTER COLUMN "createdBy" TYPE VARCHAR(255)
    USING "createdBy"::VARCHAR;
  `);
}

export async function down(pool: Pool) {
  await pool.query(`
    ALTER TABLE "BuyerReturn" 
    ALTER COLUMN "createdBy" TYPE UUID
    USING NULL;
  `);
}
