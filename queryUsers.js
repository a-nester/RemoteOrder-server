import pg from "pg";

const pool = new pg.Pool({
  connectionString:
    "postgresql://remoteorder_user:wDJme334tcPVfpgd0ozQduahRKHgHsBS@dpg-d63kbnq4d50c73dpj6i0-a.oregon-postgres.render.com/remoteorder",
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    const res = await pool.query('SELECT * FROM "User"');
    console.log(JSON.stringify(res.rows, null, 2));

    // Also check if counterpartyId exists on User
    const cols = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='User'
    `);
    console.log(
      "User columns:",
      cols.rows.map((r) => r.column_name),
    );
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
run();
