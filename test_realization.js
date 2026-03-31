import db from './dist/db.js';
(async () => {
    try {
        const res = await db.default.query("SELECT * FROM \"Realization\" WHERE number = '2202261'");
        console.log("FOUND:", res.rows);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();
