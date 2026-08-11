import express from "express";
import pool from "../db.js";
import { adminAuth, AuthRequest } from "../middleware/auth.js";

const router = express.Router();

router.use(adminAuth as any);

// Get schedule items for the week
router.get("/", async (req: AuthRequest, res) => {
  try {
    const user = req.user;
    let targetUserId: string | null = null;

    if (user) {
      if (user.role === 'admin' && req.query.userId) {
        targetUserId = String(req.query.userId);
      } else {
        targetUserId = String(user.id);
      }
    }

    let query = `
      WITH current_week_orders AS (
          SELECT * FROM "Order" 
          WHERE "createdAt" >= date_trunc('week', CURRENT_DATE)
      )
      SELECT 
        cs.id, 
        cs.day_of_week as "dayOfWeek", 
        cs.client_id, 
        c.name as client_name, 
        cs.status,
        cs."userId",
        (SELECT COUNT(*) FROM current_week_orders o WHERE o."counterpartyId" = cs.client_id AND EXTRACT(ISODOW FROM o."createdAt") = cs.day_of_week) as order_count,
        (SELECT COALESCE(SUM(oi.quantity), 0) FROM "OrderItem" oi JOIN current_week_orders o ON oi."orderId" = o.id WHERE o."counterpartyId" = cs.client_id AND EXTRACT(ISODOW FROM o."createdAt") = cs.day_of_week) as product_count
      FROM collection_schedule cs
      JOIN "Counterparty" c ON cs.client_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (targetUserId) {
      query += ` AND (cs."userId" = $1 OR cs."userId" IS NULL)`;
      params.push(targetUserId);
    }

    query += ` ORDER BY cs.day_of_week, c.name`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch collection schedule:", error);
    res.status(500).json({ error: "Failed to fetch collection schedule" });
  }
});

// Add new schedule item
router.post("/", async (req: AuthRequest, res) => {
  const { dayOfWeek, clientId, userId } = req.body;
  const user = req.user;

  let targetUserId = user?.id ? String(user.id) : null;
  if (user?.role === 'admin' && userId) {
    targetUserId = String(userId);
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO collection_schedule (day_of_week, client_id, status, "userId")
      VALUES ($1, $2, 'planned', $3)
      RETURNING id, day_of_week as "dayOfWeek", client_id, status, "userId",
        (SELECT name FROM "Counterparty" WHERE id = $2) as client_name
      `,
      [dayOfWeek, clientId, targetUserId],
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

// Update day (Drag and Drop)
router.patch("/:id/day", async (req, res) => {
  const { id } = req.params;
  const { dayOfWeek } = req.body;

  try {
    const result = await pool.query(
      `
      UPDATE collection_schedule
      SET day_of_week = $1
      WHERE id = $2
      RETURNING id, day_of_week as "dayOfWeek", client_id, status
      `,
      [dayOfWeek, id],
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to update day:", error);
    res.status(500).json({ error: "Failed to update day" });
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
router.get("/day-summary", async (req: AuthRequest, res) => {
  const { dayOfWeek, userId } = req.query;
  const user = req.user;

  let targetUserId = user?.id ? String(user.id) : null;
  if (user?.role === 'admin' && userId) {
    targetUserId = String(userId);
  }

  try {
    const result = await pool.query(
      `
      WITH clients_on_day AS (
        SELECT client_id FROM collection_schedule 
        WHERE day_of_week = $1 AND ($2::text IS NULL OR "userId" = $2 OR "userId" IS NULL)
      ),
      current_week_orders AS (
        SELECT * FROM "Order" 
        WHERE "createdAt" >= date_trunc('week', CURRENT_DATE) 
        AND EXTRACT(ISODOW FROM "createdAt") = $1
      )
      SELECT 
        (SELECT COUNT(*) FROM clients_on_day) as client_count,
        (SELECT COUNT(*) FROM current_week_orders o WHERE o."counterpartyId" IN (SELECT client_id FROM clients_on_day)) as order_count,
        (SELECT COALESCE(SUM(oi.quantity), 0) FROM "OrderItem" oi JOIN current_week_orders o ON oi."orderId" = o.id WHERE o."counterpartyId" IN (SELECT client_id FROM clients_on_day)) as item_count
      `,
      [dayOfWeek, targetUserId],
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to fetch day summary:", error);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

export default router;
