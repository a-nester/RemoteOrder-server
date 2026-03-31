const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://remote_order_user:mypassword123@localhost:5432/remote_order_db' });
(async () => {
    const tables = ["Realization", "BuyerReturn", "GoodsReceipt", "PriceDocument"];
    for (const t of tables) {
        const res = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = '${t}' AND column_name = 'isDeleted'`);
        console.log(t, "has isDeleted:", res.rowCount > 0);
    }
    process.exit(0);
})();
