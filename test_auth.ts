import pool from './src/db.js';

(async () => {
    try {
        const res = await pool.query('SELECT * FROM "User"');
        console.log("Users:", res.rows);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();
