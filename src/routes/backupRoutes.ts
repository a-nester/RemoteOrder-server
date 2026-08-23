import { Router, Request, Response } from 'express';
import { adminAuth, AuthRequest } from '../middleware/auth.js';
import { BackupService } from '../services/backupService.js';

const router = Router();

// Require admin authentication for all backup endpoints
router.use(adminAuth as any);

// GET /api/admin/backups - List backups
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const backups = await BackupService.listBackups();
    res.json({ success: true, data: backups });
  } catch (error) {
    console.error('List backups error:', error);
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

// POST /api/admin/backups - Create instant backup
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const backup = await BackupService.createBackup();
    res.status(201).json({ success: true, message: 'Backup created successfully', data: backup });
  } catch (error) {
    console.error('Create backup error:', error);
    res.status(500).json({ error: 'Failed to create backup', details: error instanceof Error ? error.message : String(error) });
  }
});

// GET /api/admin/backups/:filename/download - Download backup file
router.get('/:filename/download', async (req: AuthRequest, res: Response) => {
  try {
    const filename = String(req.params.filename);
    const filePath = await BackupService.getBackupFilePath(filename);

    if (!filePath) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    res.download(filePath, filename);
  } catch (error) {
    console.error('Download backup error:', error);
    res.status(500).json({ error: 'Failed to download backup' });
  }
});

// DELETE /api/admin/backups/:filename - Delete backup file
router.delete('/:filename', async (req: AuthRequest, res: Response) => {
  try {
    const filename = String(req.params.filename);
    const deleted = await BackupService.deleteBackup(filename);

    if (!deleted) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    res.json({ success: true, message: 'Backup deleted successfully' });
  } catch (error) {
    console.error('Delete backup error:', error);
    res.status(500).json({ error: 'Failed to delete backup' });
  }
});

export default router;
