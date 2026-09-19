import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import type { ReportCoordinates } from '@/types/report';

const DB_NAME = 'ecobantay_drafts.db';
const IMAGE_DIR = `${FileSystem.documentDirectory ?? ''}drafts/`;

export type DraftType = 'report' | 'event';

/** Report form fields kept in a draft. Photo metadata lines up index-for-index with imageUris. */
export type ReportDraftData = {
  categoryIndex: number;
  barangay: string;
  locationText: string;
  description: string;
  coordinates: ReportCoordinates | null;
  locationAccuracy?: number;
  hideCreatorName: boolean;
  photos: {
    timestamp: string;
    captureCoordinates: ReportCoordinates | null;
    captureSource: 'exif' | 'device' | null;
  }[];
};

/** Event form fields kept in a draft. Dates are ISO strings so they survive JSON. */
export type EventDraftData = {
  categoryIndex: number;
  barangay: string;
  locationText: string;
  title: string;
  description: string;
  capacity: string;
  hideParticipants: boolean;
  coordinates: ReportCoordinates | null;
  eventDateIso: string;
  eventTimeIso: string;
};

type DraftDataByType = {
  report: ReportDraftData;
  event: EventDraftData;
};

export type DraftSummary = {
  id: string;
  type: DraftType;
  title: string;
  imageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type Draft<T extends DraftType = DraftType> = DraftSummary & {
  type: T;
  data: DraftDataByType[T];
  imageUris: string[];
};

type DraftRow = {
  id: string;
  user_uid: string;
  type: DraftType;
  title: string;
  payload_json: string;
  image_uris_json: string;
  created_at: string;
  updated_at: string;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/*
 * Drafts live in their own database, apart from the offline upload queue: queued rows are finished
 * reports that sync on their own, while drafts are unfinished forms that must never be uploaded.
 */
async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS drafts (
          id TEXT PRIMARY KEY NOT NULL,
          user_uid TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          image_uris_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}

function parseUris(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((uri): uri is string => typeof uri === 'string') : [];
  } catch {
    return [];
  }
}

async function deleteFiles(uris: string[]) {
  for (const uri of uris) {
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // A leftover file is harmless; the draft row is what matters.
    }
  }
}

/**
 * Copies photos into the drafts folder. Camera and picker results sit in cache storage that the
 * OS may clear at any time, so a draft that only kept those paths could lose its photos.
 * Photos already in the folder (from an earlier save of this draft) are kept as they are.
 */
async function persistImages(draftId: string, uris: string[]): Promise<string[]> {
  const info = await FileSystem.getInfoAsync(IMAGE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(IMAGE_DIR, { intermediates: true });
  }

  const saved: string[] = [];
  for (let index = 0; index < uris.length; index += 1) {
    const uri = uris[index];
    if (uri.startsWith(IMAGE_DIR)) {
      saved.push(uri);
      continue;
    }
    const dest = `${IMAGE_DIR}${draftId}_${Date.now()}_${index}.jpg`;
    await FileSystem.copyAsync({ from: uri, to: dest });
    saved.push(dest);
  }
  return saved;
}

function toSummary(row: DraftRow): DraftSummary {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    imageCount: parseUris(row.image_uris_json).length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Creates or updates a draft and returns its id and the persisted photo paths.
 * Callers should swap their photo state to the returned paths so later saves don't copy again.
 */
export async function saveDraft<T extends DraftType>(input: {
  id?: string | null;
  userUid: string;
  type: T;
  title: string;
  data: DraftDataByType[T];
  imageUris: string[];
}): Promise<{ id: string; imageUris: string[] }> {
  const db = await getDb();
  const now = new Date().toISOString();
  const existing = input.id
    ? await db.getFirstAsync<DraftRow>(
        'SELECT * FROM drafts WHERE id = ? AND user_uid = ?',
        input.id,
        input.userUid,
      )
    : null;
  const id = existing?.id ?? `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const imageUris = await persistImages(id, input.imageUris);

  if (existing) {
    await db.runAsync(
      `UPDATE drafts SET title = ?, payload_json = ?, image_uris_json = ?, updated_at = ? WHERE id = ?`,
      input.title,
      JSON.stringify(input.data),
      JSON.stringify(imageUris),
      now,
      id,
    );
    // Remove copies of photos the user deleted since the last save.
    const dropped = parseUris(existing.image_uris_json).filter((uri) => !imageUris.includes(uri));
    await deleteFiles(dropped);
  } else {
    await db.runAsync(
      `INSERT INTO drafts (id, user_uid, type, title, payload_json, image_uris_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.userUid,
      input.type,
      input.title,
      JSON.stringify(input.data),
      JSON.stringify(imageUris),
      now,
      now,
    );
  }

  return { id, imageUris };
}

/** Returns the id of a user's most recently edited draft of one type, if there is one. */
export async function getLatestDraftId(userUid: string, type: DraftType): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM drafts WHERE user_uid = ? AND type = ? ORDER BY updated_at DESC LIMIT 1',
    userUid,
    type,
  );
  return row?.id ?? null;
}

/** Loads one draft, or null if it doesn't exist, belongs to someone else, or is the wrong type. */
export async function getDraft<T extends DraftType>(
  id: string,
  userUid: string,
  type: T,
): Promise<Draft<T> | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<DraftRow>(
    'SELECT * FROM drafts WHERE id = ? AND user_uid = ? AND type = ?',
    id,
    userUid,
    type,
  );
  if (!row) return null;

  try {
    // Drop photos whose files have gone missing so the form never shows broken thumbnails.
    const imageUris: string[] = [];
    const keptIndexes: number[] = [];
    const storedUris = parseUris(row.image_uris_json);
    for (let index = 0; index < storedUris.length; index += 1) {
      const info = await FileSystem.getInfoAsync(storedUris[index]);
      if (info.exists) {
        imageUris.push(storedUris[index]);
        keptIndexes.push(index);
      }
    }

    const data = JSON.parse(row.payload_json) as DraftDataByType[T];
    if (type === 'report') {
      const reportData = data as ReportDraftData;
      reportData.photos = keptIndexes
        .map((index) => reportData.photos?.[index])
        .filter((photo): photo is ReportDraftData['photos'][number] => Boolean(photo));
    }

    return { ...toSummary(row), type, data, imageUris };
  } catch {
    return null;
  }
}

/** Deletes a draft and its photo copies. */
export async function deleteDraft(id: string) {
  const db = await getDb();
  const row = await db.getFirstAsync<DraftRow>('SELECT * FROM drafts WHERE id = ?', id);
  if (!row) return;
  await db.runAsync('DELETE FROM drafts WHERE id = ?', id);
  await deleteFiles(parseUris(row.image_uris_json));
}
