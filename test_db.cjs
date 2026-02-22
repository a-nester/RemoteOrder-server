const { Pool } = require("pg");
require("dotenv").config();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    await pool.query("BEGIN"); // Start a transaction
    const res = await pool.query(`
      WITH RankedItems AS (
        SELECT id, "orderId", "productId", quantity, "sellPrice",
               ROW_NUMBER() OVER (
                 PARTITION BY "orderId", "productId", quantity, "sellPrice"
                 ORDER BY "createdAt" DESC
               ) as rn
        FROM "OrderItem"
      )
      DELETE FROM "OrderItem"
      WHERE id IN (
        SELECT id FROM RankedItems WHERE rn > 1
      )
      RETURNING *;
    `);
    console.log(
      `Cleaned up ${res.rowCount} duplicated OrderItem rows from the database.`,
    );

    await pool.query("COMMIT");
  } catch (e) {
    console.error(e);
    await pool.query("ROLLBACK");
  } finally {
    process.exit(0);
  }
}
run();
