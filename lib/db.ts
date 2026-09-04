import * as SQLite from 'expo-sqlite';
import type { MediaRecord } from './types';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('proofsnap.db');
    await initSchema();
  }
  return db;
}

async function initSchema() {
  if (!db) return;
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS media_records (
      id TEXT PRIMARY KEY,
      fileUri TEXT NOT NULL,
      fileName TEXT NOT NULL,
      fileType TEXT NOT NULL DEFAULT 'image',
      fileSize INTEGER DEFAULT 0,
      fileHash TEXT,
      signature TEXT,
      publicKey TEXT,
      timestamp INTEGER,
      blockchainTx TEXT,
      blockNumber INTEGER,
      aiDeepfakeScore REAL DEFAULT 0,
      aiGeneratedScore REAL DEFAULT 0,
      plagiarismScore REAL DEFAULT 0,
      trustScore REAL DEFAULT 0,
      trustGrade TEXT DEFAULT 'F',
      watermarkedUri TEXT,
      imageUrl TEXT,
      status TEXT DEFAULT 'pending',
      deviceInfo TEXT,
      location TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);

  // Migration: add imageUrl column if missing (for existing databases)
  try {
    await db.execAsync(`ALTER TABLE media_records ADD COLUMN imageUrl TEXT;`);
  } catch {
    // Column already exists — ignore
  }
}

export async function insertMediaRecord(record: MediaRecord): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT OR REPLACE INTO media_records 
     (id, fileUri, fileName, fileType, fileSize, fileHash, signature, publicKey,
      timestamp, blockchainTx, blockNumber, aiDeepfakeScore, aiGeneratedScore,
      plagiarismScore, trustScore, trustGrade, watermarkedUri, imageUrl, status,
      deviceInfo, location, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.fileUri,
      record.fileName,
      record.fileType,
      record.fileSize,
      record.fileHash,
      record.signature,
      record.publicKey,
      record.timestamp,
      record.blockchainTx,
      record.blockNumber,
      record.aiDeepfakeScore,
      record.aiGeneratedScore,
      record.plagiarismScore,
      record.trustScore,
      record.trustGrade,
      record.watermarkedUri,
      record.imageUrl,
      record.status,
      record.deviceInfo,
      record.location,
      record.createdAt,
      record.updatedAt,
    ]
  );
}

export async function updateMediaRecord(
  id: string,
  updates: Partial<MediaRecord>
): Promise<void> {
  const database = await getDb();
  const fields: string[] = [];
  const values: any[] = [];

  Object.entries(updates).forEach(([key, value]) => {
    if (key !== 'id') {
      // Convert camelCase to the DB column name (same in our case)
      fields.push(`${key} = ?`);
      values.push(value);
    }
  });

  if (fields.length === 0) return;
  values.push(id);

  await database.runAsync(
    `UPDATE media_records SET ${fields.join(', ')}, updatedAt = datetime('now') WHERE id = ?`,
    values
  );
}

export async function getAllRecords(): Promise<MediaRecord[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<MediaRecord>(
    'SELECT * FROM media_records ORDER BY createdAt DESC'
  );
  return rows;
}

export async function getRecordById(id: string): Promise<MediaRecord | null> {
  const database = await getDb();
  const row = await database.getFirstAsync<MediaRecord>(
    'SELECT * FROM media_records WHERE id = ?',
    [id]
  );
  return row ?? null;
}

export async function getRecordsByStatus(status: string): Promise<MediaRecord[]> {
  const database = await getDb();
  return database.getAllAsync<MediaRecord>(
    'SELECT * FROM media_records WHERE status = ? ORDER BY createdAt DESC',
    [status]
  );
}

export async function getStats() {
  const database = await getDb();
  const total = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM media_records'
  );
  const verified = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM media_records WHERE status = 'verified'"
  );
  const onChain = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM media_records WHERE blockchainTx IS NOT NULL'
  );
  return {
    total: total?.count ?? 0,
    verified: verified?.count ?? 0,
    onChain: onChain?.count ?? 0,
  };
}

export async function deleteRecord(id: string): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM media_records WHERE id = ?', [id]);
}
