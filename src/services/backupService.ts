import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { exec } from 'child_process';
import util from 'util';
import pool from '../db.js';

const execAsync = util.promisify(exec);

const BACKUP_DIR = path.join(process.cwd(), 'backups');

// Ensure local backup directory exists
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
   * Generates a SQL dump of the database, compresses it, and saves it BOTH
   * to local disk AND to the persistent PostgreSQL table "DatabaseBackup".
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

    // Compress to gzip buffer
    const compressedBuffer = zlib.gzipSync(Buffer.from(sqlDumpContent, 'utf-8'));

    // Write to local disk cache
    fs.writeFileSync(filePath, compressedBuffer);
    const stats = fs.statSync(filePath);
    const createdAt = new Date().toISOString();

    // Persist in PostgreSQL "DatabaseBackup" table for 100% durability across server redeploys
    try {
      await pool.query(
        `INSERT INTO "DatabaseBackup" ("filename", "size", "fileData", "createdAt")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("filename") DO UPDATE SET "fileData" = EXCLUDED."fileData", "size" = EXCLUDED."size"`,
        [filename, stats.size, compressedBuffer, createdAt]
      );
    } catch (dbErr) {
      console.error('Failed to persist backup into PostgreSQL DatabaseBackup table:', dbErr);
    }

    // Run retention cleanup (keep top 7 backups)
    await BackupService.cleanupOldBackups(7);

    return {
      filename,
      size: stats.size,
      createdAt
    };
  },

  /**
   * Native fallback SQL dump generator if pg_dump CLI is not installed on the server.
   */
  generateNativeSqlDump: async (): Promise<string> => {
    const client = await pool.connect();
    try {
      let dump = `-- RemoteOrder PostgreSQL Database Dump\n-- Date: ${new Date().toISOString()}\n\n`;

      // Get all user tables except DatabaseBackup to avoid recursion
      const tablesRes = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name != 'DatabaseBackup'
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
   * Lists all existing backup files from PostgreSQL "DatabaseBackup" table (primary)
   * and local disk (fallback).
   */
  listBackups: async (): Promise<BackupFileInfo[]> => {
    const backupMap = new Map<string, BackupFileInfo>();

    // 1. Fetch persistent backups from PostgreSQL DatabaseBackup table
    try {
      const dbRes = await pool.query(
        `SELECT "filename", "size", "createdAt" FROM "DatabaseBackup" ORDER BY "createdAt" DESC`
      );
      for (const row of dbRes.rows) {
        backupMap.set(row.filename, {
          filename: row.filename,
          size: Number(row.size),
          createdAt: new Date(row.createdAt).toISOString()
        });
      }
    } catch (dbErr) {
      console.warn('Could not list backups from DatabaseBackup table:', dbErr);
    }

    // 2. Combine with local disk backups if any exist
    if (fs.existsSync(BACKUP_DIR)) {
      const files = fs.readdirSync(BACKUP_DIR);
      for (const file of files) {
        if (file.endsWith('.sql.gz') || file.endsWith('.sql')) {
          if (!backupMap.has(file)) {
            const filePath = path.join(BACKUP_DIR, file);
            const stats = fs.statSync(filePath);
            backupMap.set(file, {
              filename: file,
              size: stats.size,
              createdAt: stats.mtime.toISOString()
            });
          }
        }
      }
    }

    return Array.from(backupMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  /**
   * Deletes a backup file from both PostgreSQL table AND local disk cache.
   */
  deleteBackup: async (filename: string): Promise<boolean> => {
    const safeFilename = path.basename(filename);
    let deleted = false;

    // Delete from DB table
    try {
      const res = await pool.query(`DELETE FROM "DatabaseBackup" WHERE "filename" = $1`, [safeFilename]);
      if (res.rowCount && res.rowCount > 0) deleted = true;
    } catch (dbErr) {
      console.error('Failed to delete backup from DB table:', dbErr);
    }

    // Delete from local disk
    const filePath = path.join(BACKUP_DIR, safeFilename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      deleted = true;
    }

    return deleted;
  },

  /**
   * Returns the file path or restores file from DB table to local disk cache for download.
   */
  getBackupFilePath: async (filename: string): Promise<string | null> => {
    const safeFilename = path.basename(filename);
    const filePath = path.join(BACKUP_DIR, safeFilename);

    // If exists on local disk, return immediately
    if (fs.existsSync(filePath)) {
      return filePath;
    }

    // Otherwise, fetch binary buffer from DB table and recreate local cache file
    try {
      const res = await pool.query(
        `SELECT "fileData" FROM "DatabaseBackup" WHERE "filename" = $1`,
        [safeFilename]
      );
      if (res.rows.length > 0 && res.rows[0].fileData) {
        fs.writeFileSync(filePath, res.rows[0].fileData);
        return filePath;
      }
    } catch (e) {
      console.error('Failed to retrieve backup file from database:', e);
    }

    return null;
  },

  /**
   * Cleans up old backups beyond retainDays (default 7 days).
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
