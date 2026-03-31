import db from './dist/db.js';
(async () => {
  const Realization = await db.default.query("SELECT * FROM \"Realization\" LIMIT 1");
  console.log("Realization:", Object.keys(Realization.rows[0] || {}));
  const GoodsReceipt = await db.default.query("SELECT * FROM \"GoodsReceipt\" LIMIT 1");
  console.log("GoodsReceipt:", Object.keys(GoodsReceipt.rows[0] || {}));
  const BuyerReturn = await db.default.query("SELECT * FROM \"BuyerReturn\" LIMIT 1");
  console.log("BuyerReturn:", Object.keys(BuyerReturn.rows[0] || {}));
  const PriceDocument = await db.default.query("SELECT * FROM \"PriceDocument\" LIMIT 1");
  console.log("PriceDocument:", Object.keys(PriceDocument.rows[0] || {}));
  process.exit(0);
})();
