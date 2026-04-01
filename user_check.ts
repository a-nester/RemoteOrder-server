import pool from './src/db.js';
(async () => {
    try {
        const res = await pool.query("SELECT * FROM \"User\" WHERE email = 'admin@test.com'");
        console.log("User:", res.rows);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();
