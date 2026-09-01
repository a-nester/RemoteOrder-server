import pool from '../db.js';

export interface AuditLogParams {
  userId?: string;
  userName?: string;
  userRole?: string;
  action: 'UNPOST' | 'DELETE' | 'UPDATE' | 'POST' | 'CANCEL' | 'PRICE_CHANGE';
  entity: 'Realization' | 'Order' | 'BuyerReturn' | 'GoodsReceipt' | 'CashTransaction';
  entityId: string;
  oldData?: any;
  newData?: any;
  reason?: string;
  ipAddress?: string;
}

export class AuditService {
  static async log(client: any, params: AuditLogParams) {
    const dbClient = client || pool;
    try {
      await dbClient.query(`
        INSERT INTO "AuditLog" ("userId", "userName", "userRole", "action", "entity", "entityId", "oldData", "newData", "reason", "ipAddress", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      `, [
        params.userId || null,
        params.userName || null,
        params.userRole || null,
        params.action,
        params.entity,
        params.entityId,
        params.oldData ? JSON.stringify(params.oldData) : null,
        params.newData ? JSON.stringify(params.newData) : null,
        params.reason || null,
        params.ipAddress || null
      ]);
    } catch (err) {
      console.error('AuditLog Error:', err);
    }
  }

  static async getLogs(filters: { entity?: string; entityId?: string; userId?: string; limit?: number }) {
    let query = `SELECT * FROM "AuditLog" WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;

    if (filters.entity) {
      query += ` AND "entity" = $${idx++}`;
      params.push(filters.entity);
    }
    if (filters.entityId) {
      query += ` AND "entityId" = $${idx++}`;
      params.push(filters.entityId);
    }
    if (filters.userId) {
      query += ` AND "userId" = $${idx++}`;
      params.push(filters.userId);
    }

    query += ` ORDER BY "createdAt" DESC LIMIT $${idx}`;
    params.push(filters.limit || 100);

    const res = await pool.query(query, params);
    return res.rows;
  }
}
