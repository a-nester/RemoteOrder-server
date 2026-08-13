import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { exec } from 'child_process';
import util from 'util';
import pool from '../db.js';

const execAsync = util.promisify(exec);

const BACKUP_DIR = path.join(process.cwd(), 'backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export interface BackupFileInfo {
  filename: string;
  size: number;
  createdAt: string;
}

export const BackupService = {
  /**
   * Generates a SQL dump of the database and compresses it into a .sql.gz file.
   */
  createBackup: async (): Promise<BackupFileInfo> => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${timestamp}.sql.gz`;
    const filePath = path.join(BACKUP_DIR, filename);

    // Try pg_dump first if available, fallback to node-pg sql dumper
    let sqlDumpContent = '';
    const dbUrl = process.env.DATABASE_URL;

    try {
      if (dbUrl) {
        const { stdout } = await execAsync(`pg_dump "${dbUrl}"`, { maxBuffer: 50 * 1024 * 1024 });
        sqlDumpContent = stdout;
      }
    } catch (e) {
      console.warn('pg_dump binary unavailable or failed, using native Node fallback dumper...');
    }

    if (!sqlDumpContent) {
      // Fallback: Dump tables directly using PostgreSQL metadata
      sqlDumpContent = await BackupService.generateNativeSqlDump();
    }

    // Compress to gzip and write to disk
    const compressed = zlib.gzipSync(Buffer.from(sqlDumpContent, 'utf-8'));
    fs.writeFileSync(filePath, compressed);

    const stats = fs.statSync(filePath);

    // Run retention cleanup
    await BackupService.cleanupOldBackups(7);

    return {
      filename,
      size: stats.size,
      createdAt: new Date().toISOString()
    };
  },

  /**
   * Native fallback SQL dump generator if pg_dump CLI is not installed on the server.
   */
  generateNativeSqlDump: async (): Promise<string> => {
    const client = await pool.connect();
    try {
      let dump = `-- RemoteOrder PostgreSQL Database Dump\n-- Date: ${new Date().toISOString()}\n\n`;

      // Get all user tables
      const tablesRes = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `);

      for (const row of tablesRes.rows) {
        const tableName = row.table_name;
        dump += `-- Table: "${tableName}"\n`;

        // Fetch all rows
        const dataRes = await client.query(`SELECT * FROM "${tableName}"`);
        if (dataRes.rows.length === 0) continue;

        const columns = Object.keys(dataRes.rows[0]);
        const colNames = columns.map(c => `"${c}"`).join(', ');

        for (const dataRow of dataRes.rows) {
          const values = columns.map(col => {
            const val = dataRow[col];
            if (val === null || val === undefined) return 'NULL';
            if (typeof val === 'number' || typeof val === 'boolean') return val;
            if (val instanceof Date) return `'${val.toISOString()}'`;
            if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
            return `'${String(val).replace(/'/g, "''")}'`;
          }).join(', ');

          dump += `INSERT INTO "${tableName}" (${colNames}) VALUES (${values}) ON CONFLICT DO NOTHING;\n`;
        }
        dump += `\n`;
      }

      return dump;
    } finally {
      client.release();
    }
  },

  /**
   * Lists all existing backup files in the backup directory.
   */
  listBackups: async (): Promise<BackupFileInfo[]> => {
    if (!fs.existsSync(BACKUP_DIR)) return [];

    const files = fs.readdirSync(BACKUP_DIR);
    const backups: BackupFileInfo[] = [];

    for (const file of files) {
      if (file.endsWith('.sql.gz') || file.endsWith('.sql')) {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        backups.push({
          filename: file,
          size: stats.size,
          createdAt: stats.mtime.toISOString()
        });
      }
    }

    return backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  /**
   * Deletes a backup file by filename.
   */
  deleteBackup: async (filename: string): Promise<boolean> => {
    // Sanitize filename to prevent path traversal
    const safeFilename = path.basename(filename);
    const filePath = path.join(BACKUP_DIR, safeFilename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  },

  /**
   * Returns the file path for downloading.
   */
  getBackupFilePath: (filename: string): string | null => {
    const safeFilename = path.basename(filename);
    const filePath = path.join(BACKUP_DIR, safeFilename);
    return fs.existsSync(filePath) ? filePath : null;
  },

  /**
   * Cleans up backups older than retainDays (default 7 days).
   */
  cleanupOldBackups: async (retainDays = 7): Promise<number> => {
    const backups = await BackupService.listBackups();
    if (backups.length <= retainDays) return 0;

    const toDelete = backups.slice(retainDays);
    let deletedCount = 0;

    for (const b of toDelete) {
      if (await BackupService.deleteBackup(b.filename)) {
        deletedCount++;
      }
    }

    return deletedCount;
  }
};
