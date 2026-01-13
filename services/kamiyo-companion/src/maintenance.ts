/**
 * Database maintenance tasks - run periodically to keep the database healthy.
 */

import db from './db';
import { logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = './data';
const BACKUP_DIR = `${DATA_DIR}/backups`;
const DB_PATH = `${DATA_DIR}/companion.db`;

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Clean up old conversation history (keep last 30 days per user)
 */
export function cleanupConversations(daysToKeep = 30): number {
  const cutoff = Math.floor(Date.now() / 1000) - (daysToKeep * 24 * 60 * 60);
  const result = db.prepare('DELETE FROM conversations WHERE created_at < ?').run(cutoff);
  logger.info('Cleaned up old conversations', { deleted: result.changes, daysToKeep });
  return result.changes;
}

/**
 * Clean up old sessions (keep last 90 days)
 */
export function cleanupSessions(daysToKeep = 90): number {
  const cutoff = Math.floor(Date.now() / 1000) - (daysToKeep * 24 * 60 * 60);
  const result = db.prepare('DELETE FROM sessions WHERE ended_at IS NOT NULL AND ended_at < ?').run(cutoff);
  logger.info('Cleaned up old sessions', { deleted: result.changes, daysToKeep });
  return result.changes;
}

/**
 * Clean up old processed tweets (keep last 7 days)
 */
export function cleanupProcessedTweets(daysToKeep = 7): number {
  const cutoff = Math.floor(Date.now() / 1000) - (daysToKeep * 24 * 60 * 60);
  const result = db.prepare('DELETE FROM processed_tweets WHERE processed_at < ?').run(cutoff);
  logger.info('Cleaned up old processed tweets', { deleted: result.changes, daysToKeep });
  return result.changes;
}

/**
 * Clean up old message counts (keep last 7 days)
 */
export function cleanupMessageCounts(daysToKeep = 7): number {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  const cutoff = cutoffDate.toISOString().split('T')[0];
  const result = db.prepare('DELETE FROM daily_message_counts WHERE date < ?').run(cutoff);
  logger.info('Cleaned up old message counts', { deleted: result.changes, daysToKeep });
  return result.changes;
}

/**
 * Clean up released/refunded escrows older than 30 days
 */
export function cleanupOldEscrows(daysToKeep = 30): number {
  const cutoff = Math.floor(Date.now() / 1000) - (daysToKeep * 24 * 60 * 60);
  const result = db.prepare(`
    DELETE FROM escrow_sessions
    WHERE status IN ('released', 'refunded')
    AND released_at IS NOT NULL
    AND released_at < ?
  `).run(cutoff);
  logger.info('Cleaned up old escrows', { deleted: result.changes, daysToKeep });
  return result.changes;
}

/**
 * Run VACUUM to reclaim disk space
 */
export function vacuumDatabase(): void {
  db.exec('VACUUM');
  logger.info('Database vacuumed');
}

/**
 * Get database statistics
 */
export function getDatabaseStats(): Record<string, number> {
  const tables = ['users', 'conversations', 'sessions', 'payments', 'escrow_sessions', 'daily_message_counts', 'processed_tweets', 'bot_state'];
  const stats: Record<string, number> = {};

  for (const table of tables) {
    const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
    stats[table] = row.count;
  }

  // Get database file size
  try {
    const dbStats = fs.statSync(DB_PATH);
    stats.database_size_mb = Math.round(dbStats.size / 1024 / 1024 * 100) / 100;
  } catch {
    stats.database_size_mb = 0;
  }

  return stats;
}

/**
 * Create a backup of the database
 */
export function backupDatabase(): string | null {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `companion-${timestamp}.db`);

    // Use SQLite backup API via better-sqlite3
    db.backup(backupPath);

    logger.info('Database backed up', { path: backupPath });

    // Clean up old backups (keep last 7)
    cleanupOldBackups(7);

    return backupPath;
  } catch (err) {
    logger.error('Database backup failed', { error: String(err) });
    return null;
  }
}

/**
 * Remove old backup files
 */
export function cleanupOldBackups(keepCount = 7): number {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('companion-') && f.endsWith('.db'))
      .map(f => ({ name: f, path: path.join(BACKUP_DIR, f), mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    let deleted = 0;
    for (let i = keepCount; i < files.length; i++) {
      fs.unlinkSync(files[i].path);
      deleted++;
    }

    if (deleted > 0) {
      logger.info('Cleaned up old backups', { deleted, kept: keepCount });
    }

    return deleted;
  } catch (err) {
    logger.error('Backup cleanup failed', { error: String(err) });
    return 0;
  }
}

/**
 * Run all maintenance tasks
 */
export function runMaintenance(): void {
  logger.info('Starting maintenance tasks...');

  const stats = getDatabaseStats();
  logger.info('Database stats before maintenance', stats);

  // Cleanup tasks
  cleanupConversations(30);
  cleanupSessions(90);
  cleanupProcessedTweets(7);
  cleanupMessageCounts(7);
  cleanupOldEscrows(30);

  // Vacuum if database is large (> 50MB)
  if (stats.database_size_mb > 50) {
    vacuumDatabase();
  }

  // Create backup
  backupDatabase();

  const statsAfter = getDatabaseStats();
  logger.info('Maintenance complete', { statsBefore: stats, statsAfter });
}

// Maintenance interval (run every 24 hours)
let maintenanceInterval: NodeJS.Timeout | null = null;

export function startMaintenanceSchedule(): void {
  if (maintenanceInterval) return;

  // Run initial cleanup
  setTimeout(() => runMaintenance(), 60 * 1000); // Wait 1 minute after startup

  // Schedule daily maintenance
  maintenanceInterval = setInterval(() => {
    runMaintenance();
  }, 24 * 60 * 60 * 1000);

  logger.info('Maintenance schedule started (daily)');
}

export function stopMaintenanceSchedule(): void {
  if (maintenanceInterval) {
    clearInterval(maintenanceInterval);
    maintenanceInterval = null;
    logger.info('Maintenance schedule stopped');
  }
}
