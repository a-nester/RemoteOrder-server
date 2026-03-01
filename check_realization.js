import pg from "pg";

const pool = new pg.Pool({
  connectionString: "postgresql://postgres:postgres@127.0.0.1:5432/remoteorder",
});

async function run() {
  const res = await pool.query(
    `SELECT status, COUNT(*) FROM "Realization" GROUP BY status`,
  );
  console.log(res.rows);
  process.exit(0);
}

run();
