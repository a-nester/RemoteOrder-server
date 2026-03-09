import express from "express";
import pool from "../db.js";
import { adminAuth } from "../middleware/auth.js";

const router = express.Router();

router.use(adminAuth as any);

// Get schedule items between dates
router.get("/", async (req, res) => {
  const { from, to } = req.query;

  try {
    const result = await pool.query(
      `
      SELECT 
        cs.id, 
        TO_CHAR(cs.date, 'YYYY-MM-DD') as date, 
        cs.client_id, 
        c.name as client_name, 
        cs.status,
        (SELECT COUNT(*) FROM orders o WHERE o.client_id = cs.client_id AND TO_CHAR(o.date, 'YYYY-MM-DD') = TO_CHAR(cs.date, 'YYYY-MM-DD')) as order_count,
        (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.client_id = cs.client_id AND TO_CHAR(o.date, 'YYYY-MM-DD') = TO_CHAR(cs.date, 'YYYY-MM-DD')) as product_count
      FROM collection_schedule cs
      JOIN counterparties c ON cs.client_id = c.id
      WHERE cs.date >= $1 AND cs.date <= $2
      ORDER BY cs.date, c.name
      `,
      [from, to],
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch collection schedule:", error);
    res.status(500).json({ error: "Failed to fetch collection schedule" });
  }
});

// Add new schedule item
router.post("/", async (req, res) => {
  const { date, clientId } = req.body;

  try {
    const result = await pool.query(
      `
      INSERT INTO collection_schedule (date, client_id, status)
      VALUES ($1, $2, 'planned')
      RETURNING id, TO_CHAR(date, 'YYYY-MM-DD') as date, client_id, status,
        (SELECT name FROM counterparties WHERE id = $2) as client_name
      `,
      [date, clientId],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Failed to create schedule item:", error);
    res.status(500).json({ error: "Failed to create schedule item" });
  }
});

// Update status
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["planned", "in_progress", "done"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const result = await pool.query(
      `
      UPDATE collection_schedule
      SET status = $1
      WHERE id = $2
      RETURNING *
      `,
      [status, id],
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to update status:", error);
    res.status(500).json({ error: "Failed to update status" });
  }
});

// Update date (Drag and Drop)
router.patch("/:id/date", async (req, res) => {
  const { id } = req.params;
  const { date } = req.body;

  try {
    const result = await pool.query(
      `
      UPDATE collection_schedule
      SET date = $1
      WHERE id = $2
      RETURNING id, TO_CHAR(date, 'YYYY-MM-DD') as date, client_id, status
      `,
      [date, id],
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to update date:", error);
    res.status(500).json({ error: "Failed to update date" });
  }
});

// Delete item
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query("DELETE FROM collection_schedule WHERE id = $1", [id]);
    res.status(204).send();
  } catch (error) {
    console.error("Failed to delete item:", error);
    res.status(500).json({ error: "Failed to delete item" });
  }
});

// Day summary
router.get("/day-summary", async (req, res) => {
  const { date } = req.query;

  try {
    const result = await pool.query(
      `
      WITH clients_on_day AS (
        SELECT client_id FROM collection_schedule WHERE date = $1
      )
      SELECT 
        (SELECT COUNT(*) FROM clients_on_day) as client_count,
        (SELECT COUNT(*) FROM orders o WHERE o.client_id IN (SELECT client_id FROM clients_on_day) AND TO_CHAR(o.date, 'YYYY-MM-DD') = $1::text) as order_count,
        (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.client_id IN (SELECT client_id FROM clients_on_day) AND TO_CHAR(o.date, 'YYYY-MM-DD') = $1::text) as item_count
      `,
      [date],
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to fetch day summary:", error);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

export default router;
