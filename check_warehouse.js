import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('sslmode', 'require');
const pool = new pg.Pool({ connectionString: url.toString() });

(async () => {
  try {
    const pRes = await pool.query('SELECT id, name FROM "Product" WHERE name ILIKE \'%Сметана 20%5 кг. ТМ %Вершкова Лінія%\' OR name ILIKE \'%Вершкова Лінія%\'');
    for (const p of pRes.rows) {
       if (!p.name.includes('Сметана 20%') || !p.name.includes('5 кг')) continue;
       console.log('--- PRODUCT:', p.name, '---');
       const bRes = await pool.query(`
         SELECT pb.id, pb."quantityTotal", pb."quantityLeft", pb."createdAt", gr."warehouseId", w."name" as "wrhName"
         FROM "ProductBatch" pb
         JOIN "GoodsReceipt" gr ON pb."goodsReceiptId" = gr.id
         JOIN "Warehouse" w ON gr."warehouseId" = w.id
         WHERE pb."productId" = $1 AND pb."quantityLeft" > 0
       `, [p.id]);
       console.log('BATCHES WITH STOCK:', bRes.rows);

       const srRes = await pool.query(`
         SELECT sr.id, sr."number", sr."warehouseId", w.name as "wrhName", sri."quantity"
         FROM "SupplierReturn" sr
         JOIN "SupplierReturnItem" sri ON sr.id = sri."supplierReturnId"
         JOIN "Warehouse" w ON sr."warehouseId" = w.id
         WHERE sri."productId" = $1 AND sr.status = 'DRAFT'
       `, [p.id]);
       console.log('DRAFT RETURNS:', srRes.rows);
    }
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
})();
