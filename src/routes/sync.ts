import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// 📱 Endpoint для отримання всіх даних (pull from server)
router.post('/sync/pull', async (req: Request, res: Response) => {
  try {
    const { userId, lastSync } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const orders = await prisma.order.findMany({
      where: {
        userId: userId,
        updatedAt: {
          gte: lastSync ? new Date(lastSync) : new Date(0),
        },
      },
    });

    res.json({
      success: true,
      data: orders,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Sync pull error:', error);
    res.status(500).json({ error: 'Failed to pull data' });
  }
});

// 📱 Endpoint для надсилання змін (push to server)
router.post('/sync/push', async (req: Request, res: Response) => {
  try {
    const { userId, changes } = req.body;

    if (!userId || !Array.isArray(changes)) {
      return res.status(400).json({ error: 'userId and changes array are required' });
    }

    const results = [];

    for (const change of changes) {
      const { id, operation, data } = change;

      try {
        let result;

        if (operation === 'INSERT') {
          result = await prisma.order.create({
            data: {
              ...data,
              userId,
            },
          });
        } else if (operation === 'UPDATE') {
          result = await prisma.order.update({
            where: { id },
            data,
          });
        } else if (operation === 'DELETE') {
          result = await prisma.order.delete({
            where: { id },
          });
        }

        // Log the sync
        await prisma.syncLog.create({
          data: {
            userId,
            action: operation,
            table: 'Order',
            recordId: id,
            data: change,
            synced: true,
          },
        });

        results.push({ id, success: true, data: result });
      } catch (err) {
        results.push({ id, success: false, error: String(err) });
      }
    }

    res.json({
      success: true,
      results,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Sync push error:', error);
    res.status(500).json({ error: 'Failed to push data' });
  }
});

// 🔄 Full sync endpoint (atomic operation)
router.post('/sync/full', async (req: Request, res: Response) => {
  try {
    const { userId, lastSync, changes } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Process changes
    const changeResults = [];
    if (changes && Array.isArray(changes)) {
      for (const change of changes) {
        const { id, operation, data } = change;
        try {
          let result;
          if (operation === 'INSERT') {
            result = await prisma.order.create({
              data: { ...data, userId },
            });
          } else if (operation === 'UPDATE') {
            result = await prisma.order.update({
              where: { id },
              data,
            });
          } else if (operation === 'DELETE') {
            result = await prisma.order.delete({
              where: { id },
            });
          }
          changeResults.push({ id, success: true });
        } catch (err) {
          changeResults.push({ id, success: false, error: String(err) });
        }
      }
    }

    // Get all updated data
    const orders = await prisma.order.findMany({
      where: {
        userId: userId,
        updatedAt: {
          gte: lastSync ? new Date(lastSync) : new Date(0),
        },
      },
    });

    res.json({
      success: true,
      changeResults,
      serverData: orders,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Full sync error:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// 📊 Get sync status
router.get('/sync/status/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const syncLogs = await prisma.syncLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    res.json({
      success: true,
      lastSyncs: syncLogs,
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

export default router;
