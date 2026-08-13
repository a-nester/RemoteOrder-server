import pool from '../db.js';

export const runMigration = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('🔄 Running Migration 116: Fast repair corrupted orders & restore items...');

    // 1. Update dates set-based from docNumber for corrupted window
    const dateRes = await client.query(`
      UPDATE "Order"
      SET "createdAt" = TO_TIMESTAMP(
        '20' || SUBSTRING("docNumber" FROM 5 FOR 2) || '-' || SUBSTRING("docNumber" FROM 3 FOR 2) || '-' || SUBSTRING("docNumber" FROM 1 FOR 2) || ' 12:00:00',
        'YYYY-MM-DD HH24:MI:SS'
      )
      WHERE "createdAt" >= '2026-08-12T20:00:00Z' AND "createdAt" <= '2026-08-12T22:00:00Z'
        AND "docNumber" ~ '^[0-3][0-9][0-1][0-9]26';
    `);
    console.log(`✅ Migration 116: Restored dates for ${dateRes.rowCount || 0} orders.`);

    // 2. Reconstruct items JSON array from OrderItem
    const itemsRes = await client.query(`
      UPDATE "Order" o
      SET items = sub.reconstructed_items
      FROM (
        SELECT oi."orderId"::text as oid,
               JSON_AGG(JSON_BUILD_OBJECT(
                 'id', oi.id,
                 'productId', oi."productId",
                 'quantity', oi.quantity,
                 'count', oi.quantity,
                 'price', oi."sellPrice",
                 'total', (oi.quantity * oi."sellPrice"),
                 'productName', p.name,
                 'unit', p.unit
               )) as reconstructed_items
        FROM "OrderItem" oi
        JOIN "Product" p ON p.id::text = oi."productId"::text
        GROUP BY oi."orderId"
      ) sub
      WHERE o.id::text = sub.oid
        AND (o.items IS NULL OR o.items = '[]'::jsonb OR JSONB_ARRAY_LENGTH(o.items) = 0);
    `);
    console.log(`✅ Migration 116: Reconstructed items array from OrderItem for ${itemsRes.rowCount || 0} orders.`);

    // 3. Reconstruct items JSON array from Realization (by orderId or docNumber)
    const realRes1 = await client.query(`
      UPDATE "Order" o
      SET items = sub.reconstructed_items
      FROM (
        SELECT r."orderId"::text as oid,
               JSON_AGG(JSON_BUILD_OBJECT(
                 'id', ri.id,
                 'productId', ri."productId",
                 'quantity', ri.quantity,
                 'count', ri.quantity,
                 'price', ri.price,
                 'total', ri.total,
                 'productName', p.name,
                 'unit', p.unit
               )) as reconstructed_items
        FROM "Realization" r
        JOIN "RealizationItem" ri ON ri."realizationId"::text = r.id::text
        JOIN "Product" p ON p.id::text = ri."productId"::text
        WHERE r."orderId" IS NOT NULL
        GROUP BY r."orderId"
      ) sub
      WHERE o.id::text = sub.oid
        AND (o.items IS NULL OR o.items = '[]'::jsonb OR JSONB_ARRAY_LENGTH(o.items) = 0);
    `);
    console.log(`✅ Migration 116: Reconstructed items array from Realization by orderId for ${realRes1.rowCount || 0} orders.`);

    const realRes2 = await client.query(`
      UPDATE "Order" o
      SET items = sub.reconstructed_items
      FROM (
        SELECT o2.id as oid,
               JSON_AGG(JSON_BUILD_OBJECT(
                 'id', ri.id,
                 'productId', ri."productId",
                 'quantity', ri.quantity,
                 'count', ri.quantity,
                 'price', ri.price,
                 'total', ri.total,
                 'productName', p.name,
                 'unit', p.unit
               )) as reconstructed_items
        FROM "Order" o2
        JOIN "Realization" r ON r.number = o2."docNumber"
        JOIN "RealizationItem" ri ON ri."realizationId"::text = r.id::text
        JOIN "Product" p ON p.id::text = ri."productId"::text
        WHERE o2.items IS NULL OR o2.items = '[]'::jsonb OR JSONB_ARRAY_LENGTH(o2.items) = 0
        GROUP BY o2.id
      ) sub
      WHERE o.id::text = sub.oid
        AND (o.items IS NULL OR o.items = '[]'::jsonb OR JSONB_ARRAY_LENGTH(o.items) = 0);
    `);
    console.log(`✅ Migration 116: Reconstructed items array from Realization by docNumber for ${realRes2.rowCount || 0} orders.`);

    // 4. Populate missing OrderItem records from Realizations
    const orderItemSyncRes = await client.query(`
      INSERT INTO "OrderItem" ("id", "orderId", "productId", "quantity", "sellPrice", "sortOrder", "createdAt")
      SELECT gen_random_uuid(), sub.oid, sub.pid, sub.qty, sub.price, sub.seq, NOW()
      FROM (
        SELECT o.id as oid,
               ri."productId"::uuid as pid,
               ri.quantity as qty,
               ri.price as price,
               ROW_NUMBER() OVER (PARTITION BY o.id ORDER BY ri.id) - 1 as seq
        FROM "Order" o
        JOIN "Realization" r ON (r."orderId"::text = o.id::text OR r.number = o."docNumber")
        JOIN "RealizationItem" ri ON ri."realizationId"::text = r.id::text
        LEFT JOIN "OrderItem" oi ON oi."orderId"::text = o.id::text
        WHERE oi.id IS NULL
      ) sub
      ON CONFLICT DO NOTHING;
    `);
    console.log(`✅ Migration 116: Populated ${orderItemSyncRes.rowCount || 0} missing OrderItem records from Realizations.`);

    await client.query('COMMIT');
    console.log('🎉 Migration 116 completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration 116 failed:', error);
    throw error;
  } finally {
    client.release();
  }
};
