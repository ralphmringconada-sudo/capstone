import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { submitReport } from '@/services/reportService';
import {
  countPendingOfflineReports,
  listPendingOfflineReports,
  markOfflineReportFailed,
  markOfflineReportSyncing,
  parseLocalImageUris,
  parseOfflinePayload,
  removeOfflineReport,
} from '@/services/offlineReportQueue';

const SYNCED_IDS_KEY = 'ecobantay_synced_offline_report_ids';

let syncInFlight = false;
let unsubscribeNetInfo: (() => void) | null = null;
let activeUserUid: string | null = null;

export function isNetworkOnline(state?: NetInfoState | null): boolean {
  const current = state;
  if (!current) return false;
  if (current.isConnected === false) return false;
  if (current.isInternetReachable === false) return false;
  return true;
}

export async function checkIsOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return isNetworkOnline(state);
}

export function isLikelyOfflineError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes('network') ||
    message.includes('offline') ||
    message.includes('failed to fetch') ||
    message.includes('unreachable') ||
    message.includes('timeout') ||
    message.includes('internet') ||
    message.includes('could not reach') ||
    message.includes('connection')
  );
}

async function getSyncedIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(SYNCED_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

async function rememberSyncedId(draftId: string): Promise<void> {
  const ids = await getSyncedIds();
  if (ids.includes(draftId)) return;
  const next = [...ids, draftId].slice(-300);
  await AsyncStorage.setItem(SYNCED_IDS_KEY, JSON.stringify(next));
}

export type SyncResult = {
  synced: number;
  failed: number;
  remaining: number;
  skippedDuplicates: number;
};

/**
 * Purpose: Uploads queued offline reports to Firebase when connectivity returns.
 * How it works: skips already-synced draft IDs (conflict/duplicate protection), then submits remaining.
 */
export async function syncPendingOfflineReports(userUid: string): Promise<SyncResult> {
  if (syncInFlight) {
    return {
      synced: 0,
      failed: 0,
      remaining: await countPendingOfflineReports(userUid),
      skippedDuplicates: 0,
    };
  }

  const online = await checkIsOnline();
  if (!online) {
    return {
      synced: 0,
      failed: 0,
      remaining: await countPendingOfflineReports(userUid),
      skippedDuplicates: 0,
    };
  }

  syncInFlight = true;
  let synced = 0;
  let failed = 0;
  let skippedDuplicates = 0;

  try {
    const pending = await listPendingOfflineReports(userUid);
    const alreadySynced = new Set(await getSyncedIds());

    for (const draft of pending) {
      try {
        // Conflict resolution: if this draft already uploaded but local row remained, drop it.
        if (alreadySynced.has(draft.id)) {
          await removeOfflineReport(draft.id, draft.localImageUri);
          skippedDuplicates += 1;
          continue;
        }

        await markOfflineReportSyncing(draft.id);
        const payload = parseOfflinePayload(draft.payloadJson);
        await submitReport({
          ...payload,
          imageUris: parseLocalImageUris(draft.localImageUri),
        });
        await rememberSyncedId(draft.id);
        await removeOfflineReport(draft.id, draft.localImageUri);
        synced += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : 'Sync failed';
        await markOfflineReportFailed(draft.id, message);
        if (isLikelyOfflineError(error) || !(await checkIsOnline())) {
          break;
        }
      }
    }
  } finally {
    syncInFlight = false;
  }

  const remaining = await countPendingOfflineReports(userUid);
  return { synced, failed, remaining, skippedDuplicates };
}

export function startOfflineReportSync(userUid: string) {
  activeUserUid = userUid;
  stopOfflineReportSyncListenerOnly();

  void syncPendingOfflineReports(userUid);

  unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    if (!activeUserUid) return;
    if (isNetworkOnline(state)) {
      void syncPendingOfflineReports(activeUserUid);
    }
  });
}

function stopOfflineReportSyncListenerOnly() {
  unsubscribeNetInfo?.();
  unsubscribeNetInfo = null;
}

export function stopOfflineReportSync() {
  activeUserUid = null;
  stopOfflineReportSyncListenerOnly();
}
