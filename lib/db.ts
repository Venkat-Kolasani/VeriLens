import * as SQLite from 'expo-sqlite';
import type { KYCCase, LaneOut, VerdictReason } from './types';

// New filename rather than a migration: the old media_records rows carried
// trust scores that no longer exist, and there is no production data. Bumped
// to -v2 again when signature/publicKey/confidenceIsCalibrated were added.
const DB_NAME = 'verilens-kyc-v2.db';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS kyc_cases (
        id TEXT PRIMARY KEY,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        idImageUri TEXT NOT NULL,
        idImageSha256 TEXT,
        idImageAttested INTEGER DEFAULT 0,
        idImageUrl TEXT,
        selfieUri TEXT NOT NULL,
        selfieSha256 TEXT,
        selfieAttested INTEGER DEFAULT 0,
        selfieUrl TEXT,
        lanes TEXT,
        authenticity TEXT,
        identity TEXT,
        decision TEXT,
        confidence REAL,
        confidenceIsCalibrated INTEGER DEFAULT 0,
        reasons TEXT,
        anchorTx TEXT,
        anchorBlock INTEGER,
        anchorPayloadHash TEXT,
        signature TEXT,
        publicKey TEXT,
        reviewStatus TEXT,
        status TEXT DEFAULT 'pending',
        deviceInfo TEXT
      );
    `);
  }
  return db;
}

// ──────────────── Row ⇄ KYCCase ────────────────

/** JSON.parse that yields null instead of throwing on a malformed row. */
function parseJson<T>(raw: unknown): T[] | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

function rowToCase(row: any): KYCCase {
  return {
    ...row,
    idImageAttested: !!row.idImageAttested,
    selfieAttested: !!row.selfieAttested,
    confidenceIsCalibrated: !!row.confidenceIsCalibrated,
    lanes: parseJson<LaneOut>(row.lanes),
    reasons: parseJson<VerdictReason>(row.reasons),
  } as KYCCase;
}

const COLUMNS = [
  'id',
  'createdAt',
  'updatedAt',
  'idImageUri',
  'idImageSha256',
  'idImageAttested',
  'idImageUrl',
  'selfieUri',
  'selfieSha256',
  'selfieAttested',
  'selfieUrl',
  'lanes',
  'authenticity',
  'identity',
  'decision',
  'confidence',
  'confidenceIsCalibrated',
  'reasons',
  'anchorTx',
  'anchorBlock',
  'anchorPayloadHash',
  'signature',
  'publicKey',
  'reviewStatus',
  'status',
  'deviceInfo',
] as const;

function toColumnValue(key: string, value: any): any {
  if (key === 'lanes' || key === 'reasons') {
    return value == null ? null : JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value ?? null;
}

// ──────────────── Writes ────────────────

export async function insertCase(kycCase: KYCCase): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT OR REPLACE INTO kyc_cases (${COLUMNS.join(', ')})
     VALUES (${COLUMNS.map(() => '?').join(', ')})`,
    COLUMNS.map((c) => toColumnValue(c, (kycCase as any)[c]))
  );
}

export async function updateCase(
  id: string,
  updates: Partial<KYCCase>
): Promise<void> {
  const database = await getDb();
  // id is the WHERE key; updatedAt is always stamped below.
  const entries = Object.entries(updates).filter(
    ([key]) => key !== 'id' && key !== 'updatedAt'
  );
  if (entries.length === 0) return;

  await database.runAsync(
    `UPDATE kyc_cases SET ${entries
      .map(([key]) => `${key} = ?`)
      .join(', ')}, updatedAt = ? WHERE id = ?`,
    [
      ...entries.map(([key, value]) => toColumnValue(key, value)),
      new Date().toISOString(),
      id,
    ]
  );
}

export async function deleteCase(id: string): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM kyc_cases WHERE id = ?', [id]);
}

// ──────────────── Reads ────────────────

export async function getAllCases(): Promise<KYCCase[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<any>(
    'SELECT * FROM kyc_cases ORDER BY createdAt DESC'
  );
  return rows.map(rowToCase);
}

export async function getCaseById(id: string): Promise<KYCCase | null> {
  const database = await getDb();
  const row = await database.getFirstAsync<any>(
    'SELECT * FROM kyc_cases WHERE id = ?',
    [id]
  );
  return row ? rowToCase(row) : null;
}

export async function getCasesByStatus(status: string): Promise<KYCCase[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<any>(
    'SELECT * FROM kyc_cases WHERE status = ? ORDER BY createdAt DESC',
    [status]
  );
  return rows.map(rowToCase);
}

/** The manual-review queue: anything the pipeline could not decide. */
export async function getCasesForReview(): Promise<KYCCase[]> {
  const database = await getDb();
  const rows = await database.getAllAsync<any>(
    `SELECT * FROM kyc_cases
     WHERE decision = 'REVIEW' OR reviewStatus = 'pending'
     ORDER BY createdAt DESC`
  );
  return rows.map(rowToCase);
}

export async function getStats() {
  const database = await getDb();
  const count = async (where: string) =>
    (
      await database.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM kyc_cases ${where}`
      )
    )?.count ?? 0;

  return {
    total: await count(''),
    accepted: await count("WHERE decision = 'ACCEPT'"),
    review: await count("WHERE decision = 'REVIEW' OR reviewStatus = 'pending'"),
    onChain: await count('WHERE anchorTx IS NOT NULL'),
  };
}
