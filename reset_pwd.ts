import pool from './src/db.js';
import bcrypt from 'bcryptjs';

(async () => {
    try {
        const hash = await bcrypt.hash('password123', 10);
        await pool.query('UPDATE "User" SET password = $1', [hash]);
        console.log("All passwords reset to password123");
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();
