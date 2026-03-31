import pool from './src/db';
(async () => {
    try {
        const res = await pool.query("SELECT * FROM \"Realization\" WHERE number = '2202261'");
        console.log("FOUND:", res.rows);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();
