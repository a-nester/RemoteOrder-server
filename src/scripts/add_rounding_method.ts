import pool from '../db.js';

const run = async () => {
    try {
        await pool.query(`
            ALTER TABLE "PriceDocument" 
            ADD COLUMN "roundingMethod" VARCHAR(20) DEFAULT 'NONE';
        `);
        console.log('Successfully added roundingMethod column');
    } catch (e) {
        console.error('Error adding column (might already exist):', e);
    } finally {
        await pool.end();
    }
};

run();
