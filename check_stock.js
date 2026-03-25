import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('sslmode', 'require');

const pool = new pg.Pool({ connectionString: url.toString() });

(async () => {
  try {
    const pRes = await pool.query('SELECT id, name FROM "Product" WHERE name ILIKE \'%Сметана 20%5 кг%\' OR name ILIKE \'%Вершкова Лінія%\'');
    console.log('PRODUCTS:', pRes.rows);
    for (const p of pRes.rows) {
       const bRes = await pool.query('SELECT id, "quantityTotal", "quantityLeft", "createdAt"::date FROM "ProductBatch" WHERE "productId" = $1 ORDER BY "createdAt" ASC', [p.id]);
       console.log('BATCHES FOR', p.name, ':', bRes.rows);
    }
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
})();
