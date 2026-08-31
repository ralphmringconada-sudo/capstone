import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import type { SubmitReportInput } from '@/types/report';

const DB_NAME = 'ecobantay_offline.db';
const IMAGE_DIR = `${FileSystem.documentDirectory ?? ''}offline-reports/`;

export type OfflineReportRow = {
  id: string;
  userUid: string;
  payloadJson: string;
  /** JSON array of local image file URIs (legacy rows may be a single path string). */
  localImageUri: string;
  createdAt: string;
  syncStatus: 'pending' | 'syncing' | 'failed';
  lastError: string | null;
};

type OfflinePayload = Omit<SubmitReportInput, 'imageUris'>;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS offline_reports (
          id TEXT PRIMARY KEY NOT NULL,
          user_uid TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          local_image_uri TEXT NOT NULL,
          created_at TEXT NOT NULL,
          sync_status TEXT NOT NULL DEFAULT 'pending',
          last_error TEXT
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}

async function ensureImageDir() {
  const info = await FileSystem.getInfoAsync(IMAGE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(IMAGE_DIR, { intermediates: true });
  }
}

/** Copies each stamped proof photo into app documents so they survive until sync. */
async function persistLocalImages(sourceUris: string[], draftId: string): Promise<string[]> {
  await ensureImageDir();
  const saved: string[] = [];
  for (let index = 0; index < sourceUris.length; index += 1) {
    const dest = `${IMAGE_DIR}${draftId}_${index}.jpg`;
    await FileSystem.copyAsync({ from: sourceUris[index], to: dest });
    saved.push(dest);
  }
  return saved;
}

export function parseLocalImageUris(stored: string): string[] {
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string' && Boolean(item));
    }
  } catch {
    // Legacy single-path rows.
  }
  return [stored];
}

/**
 * Purpose: Queues a citizen report on-device when the network is unavailable.
 * How it works: copies proof photos locally, stores JSON payload in SQLite, returns the draft id.
 */
export async function enqueueOfflineReport(input: SubmitReportInput): Promise<string> {
  const id = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const localImageUris = await persistLocalImages(input.imageUris, id);
  const payload: OfflinePayload = {
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    description: input.description,
    locationText: input.locationText,
    barangay: input.barangay,
    coordinates: input.coordinates,
    photoTimestamp: input.photoTimestamp,
    imageMetadata: input.imageMetadata,
    user: input.user,
  };
  const createdAt = new Date().toISOString();

  const db = await getDb();
  await db.runAsync(
    `INSERT INTO offline_reports
      (id, user_uid, payload_json, local_image_uri, created_at, sync_status, last_error)
     VALUES (?, ?, ?, ?, ?, 'pending', NULL)`,
    id,
    input.user.uid,
    JSON.stringify(payload),
    JSON.stringify(localImageUris),
    createdAt,
  );

  return id;
}

/** Returns pending/failed drafts for one citizen, oldest first. */
export async function listPendingOfflineReports(userUid: string): Promise<OfflineReportRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    user_uid: string;
    payload_json: string;
    local_image_uri: string;
    created_at: string;
    sync_status: 'pending' | 'syncing' | 'failed';
    last_error: string | null;
  }>(
    `SELECT * FROM offline_reports
     WHERE user_uid = ?
       AND sync_status IN ('pending', 'failed')
     ORDER BY created_at ASC`,
    userUid,
  );

  return rows.map((row) => ({
    id: row.id,
    userUid: row.user_uid,
    payloadJson: row.payload_json,
    localImageUri: row.local_image_uri,
    createdAt: row.created_at,
    syncStatus: row.sync_status,
    lastError: row.last_error,
  }));
}

export async function countPendingOfflineReports(userUid: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM offline_reports
     WHERE user_uid = ? AND sync_status IN ('pending', 'failed')`,
    userUid,
  );
  return row?.count ?? 0;
}

export async function markOfflineReportSyncing(id: string) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE offline_reports SET sync_status = 'syncing', last_error = NULL WHERE id = ?`,
    id,
  );
}

export async function markOfflineReportFailed(id: string, errorMessage: string) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE offline_reports SET sync_status = 'failed', last_error = ? WHERE id = ?`,
    errorMessage.slice(0, 400),
    id,
  );
}

/** Removes a synced draft and deletes its local photo copies. */
export async function removeOfflineReport(id: string, localImageUri: string) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM offline_reports WHERE id = ?`, id);
  for (const uri of parseLocalImageUris(localImageUri)) {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }
    } catch {
      // Ignore cleanup failures; row is already removed.
    }
  }
}

export function parseOfflinePayload(payloadJson: string): OfflinePayload {
  return JSON.parse(payloadJson) as OfflinePayload;
}
