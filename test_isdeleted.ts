import pool from './src/db';
(async () => {
    try {
        const tables = ["Realization", "BuyerReturn", "GoodsReceipt", "PriceDocument"];
        for(const table of tables) {
            const res = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' AND column_name = 'isDeleted'`);
            console.log(table, "has isDeleted:", res.rowCount > 0);
        }
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();
