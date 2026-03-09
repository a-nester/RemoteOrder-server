import express from "express";
import pool from "../db.js";
import { adminAuth } from "../middleware/auth.js";

const router = express.Router();

router.use(adminAuth as any);

router.get("/", async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: "Date parameter is required" });
  }

  try {
    const result = await pool.query(
      `
      WITH scheduled_clients AS (
        SELECT client_id FROM collection_schedule WHERE TO_CHAR(date, 'YYYY-MM-DD') = $1
      ),
      relevant_orders AS (
        SELECT id FROM orders 
        WHERE client_id IN (SELECT client_id FROM scheduled_clients)
        AND TO_CHAR(date, 'YYYY-MM-DD') = $1
      )
      SELECT 
        p.id as product_id,
        p.name as product_name,
        p.sku,
        SUM(oi.quantity) as total_quantity
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id IN (SELECT id FROM relevant_orders)
      GROUP BY p.id, p.name, p.sku
      ORDER BY p.name ASC
      `,
      [date]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Failed to generate picking list:", error);
    res.status(500).json({ error: "Failed to generate picking list" });
  }
});

export default router;
