import pool from './src/db';
(async () => {
    try {
        const res = await pool.query("SELECT * FROM \"GoodsReceipt\" LIMIT 1");
        console.log("GoodsReceipt Columns:", Object.keys(res.rows[0] || {}));
        const res2 = await pool.query("SELECT * FROM \"BuyerReturn\" LIMIT 1");
        console.log("BuyerReturn Columns:", Object.keys(res2.rows[0] || {}));
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();
