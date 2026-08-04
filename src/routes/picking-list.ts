import express from "express";
import pool from "../db.js";
import { userAuth, AuthRequest } from "../middleware/auth.js";

const router = express.Router();

router.use(userAuth as any);

router.get("/", async (req, res) => {
  const { dayOfWeek } = req.query;

  if (!dayOfWeek) {
    return res.status(400).json({ error: "dayOfWeek parameter is required" });
  }

  try {
    const user = (req as AuthRequest).user;
    let userWarehouseFilter = '';
    let params: any[] = [dayOfWeek];

    if (user && user.role !== 'admin') {
        if (user.role === 'client' && user.warehouseId) {
            // Client users have a single warehouseId
            userWarehouseFilter = ` AND "warehouseId" = $${params.length + 1}`;
            params.push(user.warehouseId);
        } else if (user.role === 'manager' && user.visibleWarehouses && user.visibleWarehouses.length > 0) {
            // Manager with selected visible warehouses
            userWarehouseFilter = ` AND "warehouseId" = ANY($${params.length + 1}::uuid[])`;
            params.push(user.visibleWarehouses);
        }
        // If manager has no visibleWarehouses selected, no warehouse filter is applied (show all)
    }

    const result = await pool.query(
      `
      WITH scheduled_clients AS (
        SELECT client_id FROM collection_schedule WHERE day_of_week = $1
      ),
      relevant_orders AS (
        SELECT id FROM "Order" 
        WHERE "counterpartyId" IN (SELECT client_id FROM scheduled_clients)
        AND "createdAt" >= date_trunc('week', CURRENT_DATE)
        AND EXTRACT(ISODOW FROM "createdAt") = $1
        ${userWarehouseFilter}
      )
      SELECT 
        p.id as product_id,
        p.name as product_name,
        p.sku,
        SUM(oi.quantity) as total_quantity
      FROM "OrderItem" oi
      JOIN "Product" p ON oi."productId" = p.id
      WHERE oi."orderId" IN (SELECT id FROM relevant_orders)
      GROUP BY p.id, p.name, p.sku
      ORDER BY p.name ASC
      `,
      params
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Failed to generate picking list:", error);
    res.status(500).json({ error: "Failed to generate picking list" });
  }
});

export default router;
