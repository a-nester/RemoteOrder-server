import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

async function run() {
  // get latest order with > 5 items
  const res = await pool.query(`
    select "orderId", count(*) as item_count 
    from "OrderItem" 
    group by "orderId" 
    having count(*) > 5 
    order by item_count desc 
    limit 1`);
  console.log('Orders with many items:', res.rows);
  if (res.rows.length > 0) {
    const orderId = res.rows[0].orderId;
    const items = await pool.query('SELECT "productId", quantity, "sellPrice" FROM "OrderItem" WHERE "orderId" = $1', [orderId]);
    console.log('Items for order:', orderId, items.rows);
  }
  process.exit(0);
}
run();
