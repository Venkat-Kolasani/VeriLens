import { getDb } from './db';

let schemaInitialized = false;

export interface ScannedImage {
  id: string;
  assetId: string;          // expo-media-library asset ID
  uri: string;
  fileName: string;
  fileSize: number;
  originalHash: string;     // SHA-256 hash when first scanned
  currentHash: string;      // SHA-256 hash on last check
  source: string;           // e.g. 'WhatsApp', 'Snapchat', 'Camera', 'Downloads', 'Unknown'
  isTampered: boolean;      // true if currentHash !== originalHash
  lastCheckedAt: string;
  createdAt: string;
  albumName: string | null;
}

export async function getGalleryDb() {
  const db = await getDb();
  if (!schemaInitialized) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS scanned_images (
        id TEXT PRIMARY KEY,
        assetId TEXT UNIQUE NOT NULL,
        uri TEXT NOT NULL,
        fileName TEXT NOT NULL,
        fileSize INTEGER DEFAULT 0,
        originalHash TEXT NOT NULL,
        currentHash TEXT NOT NULL,
        source TEXT DEFAULT 'Unknown',
        isTampered INTEGER DEFAULT 0,
        lastCheckedAt TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        albumName TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_scanned_asset ON scanned_images(assetId);
      CREATE INDEX IF NOT EXISTS idx_scanned_tampered ON scanned_images(isTampered);
      CREATE INDEX IF NOT EXISTS idx_scanned_source ON scanned_images(source);
    `);
    schemaInitialized = true;
  }
  return db;
}

// Insert a newly scanned image
export async function insertScannedImage(record: ScannedImage): Promise<void> {
  const database = await getGalleryDb();
  await database.runAsync(
    `INSERT OR IGNORE INTO scanned_images
     (id, assetId, uri, fileName, fileSize, originalHash, currentHash, source, isTampered, lastCheckedAt, createdAt, albumName)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.assetId,
      record.uri,
      record.fileName,
      record.fileSize,
      record.originalHash,
      record.currentHash,
      record.source,
      record.isTampered ? 1 : 0,
      record.lastCheckedAt,
      record.createdAt,
      record.albumName,
    ]
  );
}

// Update an existing scanned image (e.g. after re-hash check)
export async function updateScannedImage(
  assetId: string,
  updates: { currentHash: string; isTampered: boolean; lastCheckedAt: string; uri?: string }
): Promise<void> {
  const database = await getGalleryDb();
  await database.runAsync(
    `UPDATE scanned_images SET currentHash = ?, isTampered = ?, lastCheckedAt = ?, uri = COALESCE(?, uri) WHERE assetId = ?`,
    [updates.currentHash, updates.isTampered ? 1 : 0, updates.lastCheckedAt, updates.uri ?? null, assetId]
  );
}

// Get all scanned images
export async function getAllScannedImages(): Promise<ScannedImage[]> {
  const database = await getGalleryDb();
  const rows = await database.getAllAsync<any>(
    'SELECT * FROM scanned_images ORDER BY createdAt DESC'
  );
  return rows.map((r) => ({ ...r, isTampered: r.isTampered === 1 }));
}

// Get tampered images only
export async function getTamperedImages(): Promise<ScannedImage[]> {
  const database = await getGalleryDb();
  const rows = await database.getAllAsync<any>(
    'SELECT * FROM scanned_images WHERE isTampered = 1 ORDER BY lastCheckedAt DESC'
  );
  return rows.map((r) => ({ ...r, isTampered: true }));
}

// Get images by source (e.g. WhatsApp)
export async function getImagesBySource(source: string): Promise<ScannedImage[]> {
  const database = await getGalleryDb();
  const rows = await database.getAllAsync<any>(
    'SELECT * FROM scanned_images WHERE source = ? ORDER BY createdAt DESC',
    [source]
  );
  return rows.map((r) => ({ ...r, isTampered: r.isTampered === 1 }));
}

// Check if an asset has been scanned before
export async function isAssetScanned(assetId: string): Promise<boolean> {
  const database = await getGalleryDb();
  const row = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM scanned_images WHERE assetId = ?',
    [assetId]
  );
  return (row?.count ?? 0) > 0;
}

// Get scanned image by asset ID
export async function getScannedByAssetId(assetId: string): Promise<ScannedImage | null> {
  const database = await getGalleryDb();
  const row = await database.getFirstAsync<any>(
    'SELECT * FROM scanned_images WHERE assetId = ?',
    [assetId]
  );
  if (!row) return null;
  return { ...row, isTampered: row.isTampered === 1 };
}

// Get scanner stats
export async function getScannerStats(): Promise<{
  totalScanned: number;
  tampered: number;
  safe: number;
  bySource: Record<string, number>;
}> {
  const database = await getGalleryDb();
  const total = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM scanned_images'
  );
  const tampered = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM scanned_images WHERE isTampered = 1'
  );
  const sources = await database.getAllAsync<{ source: string; count: number }>(
    'SELECT source, COUNT(*) as count FROM scanned_images GROUP BY source'
  );

  const bySource: Record<string, number> = {};
  for (const s of sources) {
    bySource[s.source] = s.count;
  }

  return {
    totalScanned: total?.count ?? 0,
    tampered: tampered?.count ?? 0,
    safe: (total?.count ?? 0) - (tampered?.count ?? 0),
    bySource,
  };
}

// Delete a scanned record
export async function deleteScannedImage(assetId: string): Promise<void> {
  const database = await getGalleryDb();
  await database.runAsync('DELETE FROM scanned_images WHERE assetId = ?', [assetId]);
}

// Clear all scanned records
export async function clearAllScannedImages(): Promise<void> {
  const database = await getGalleryDb();
  await database.runAsync('DELETE FROM scanned_images');
}
