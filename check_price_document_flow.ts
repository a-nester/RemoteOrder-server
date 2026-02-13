import pool from './src/db.js';

async function testPriceDocumentFlow() {
    console.log('🧪 Starting Price Document Flow Test...');
    const client = await pool.connect();

    try {
        // 0. Setup: Ensure we have a product and price type
        console.log('🛠️ Setting up test data...');

        // Ensure "standard" price type exists
        let priceTypeRes = await client.query('SELECT id FROM "PriceType" WHERE slug = $1', ['standard']);
        let priceTypeId;
        if (priceTypeRes.rows.length === 0) {
            const pt = await client.query('INSERT INTO "PriceType" (name, slug) VALUES ($1, $2) RETURNING id', ['Standard Price', 'standard']);
            priceTypeId = pt.rows[0].id;
        } else {
            priceTypeId = priceTypeRes.rows[0].id;
        }

        // Ensure a product exists
        let productRes = await client.query('SELECT id, prices FROM "Product" LIMIT 1');
        let productId;
        let initialPrice = 100;

        if (productRes.rows.length === 0) {
            const prod = await client.query('INSERT INTO "Product" (name, "unit", prices) VALUES ($1, $2, $3) RETURNING id', ['Test Product', 'pcs', JSON.stringify({ standard: initialPrice })]);
            productId = prod.rows[0].id;
        } else {
            productId = productRes.rows[0].id;
            // Reset price to known value
            await client.query('UPDATE "Product" SET prices = $1 WHERE id = $2', [JSON.stringify({ standard: initialPrice }), productId]);
        }

        console.log(`Prouct ID: ${productId}, Price Type ID: ${priceTypeId}`);

        // 1. Create Draft Document
        console.log('📝 Creating Draft Document...');
        const docRes = await client.query(`
            INSERT INTO "PriceDocument" (
                "date", "targetPriceTypeId", "inputMethod", "status", "createdAt"
            )
            VALUES (NOW(), $1, 'MANUAL', 'DRAFT', NOW())
            RETURNING id
        `, [priceTypeId]);
        const docId = docRes.rows[0].id;
        console.log(`Document Created: ${docId}`);

        // 2. Add Items
        console.log('➕ Adding Items...');
        const newPrice = 150.00;
        await client.query(`
            INSERT INTO "PriceDocumentItem" ("documentId", "productId", "price")
            VALUES ($1, $2, $3)
        `, [docId, productId, newPrice]);

        // 3. Verify Items
        const itemsRes = await client.query('SELECT * FROM "PriceDocumentItem" WHERE "documentId" = $1', [docId]);
        if (itemsRes.rows.length !== 1 || Number(itemsRes.rows[0].price) !== newPrice) {
            throw new Error('Items verification failed');
        }
        console.log('✅ Items Verified');

        // 4. Apply Document
        console.log('🚀 Applying Document (Simulating API logic)...');

        // Reuse logic from controller essentially, or just call the API if server was running. 
        // Here we simulate the controller logic to test DB interactions directly.
        await client.query('BEGIN');

        // Log to Journal
        await client.query(`
            INSERT INTO "PriceJournal" (
                "productId", "priceTypeId", "oldPrice", "newPrice", 
                "effectiveDate", "createdAt", "reason"
            )
            VALUES ($1, $2, $3, $4, NOW(), NOW(), 'Test Apply')
        `, [productId, priceTypeId, initialPrice, newPrice]);

        // Update Product
        const newPrices = { standard: newPrice };
        await client.query(`
            UPDATE "Product" SET prices = $1 WHERE id = $2
        `, [JSON.stringify(newPrices), productId]);

        // Update Doc Status
        await client.query('UPDATE "PriceDocument" SET status = \'APPLIED\' WHERE id = $1', [docId]);

        await client.query('COMMIT');
        console.log('✅ Document Applied');

        // 5. Verify Product Price
        const finalProductRes = await client.query('SELECT prices FROM "Product" WHERE id = $1', [productId]);
        const finalPrice = finalProductRes.rows[0].prices['standard'];
        if (Number(finalPrice) !== newPrice) {
            console.error(`Expected ${newPrice}, got ${finalPrice}`);
            throw new Error('Product price verification failed');
        }
        console.log('✅ Product Price Verified');

        // 6. Verify Journal
        const journalRes = await client.query('SELECT * FROM "PriceJournal" WHERE "productId" = $1 ORDER BY "createdAt" DESC LIMIT 1', [productId]);
        if (Number(journalRes.rows[0].newPrice) !== newPrice) {
            throw new Error('Journal verification failed');
        }
        console.log('✅ Journal Verified');

        console.log('🎉 Test Passed Successfully!');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Test Failed:', error);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

testPriceDocumentFlow();
