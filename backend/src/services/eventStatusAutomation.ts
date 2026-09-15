import { getFirestore } from 'firebase-admin/firestore';

/**
 * Automatic EcoBantay event lifecycle:
 *
 * Pending  -> Approved   = administrator action
 * Approved -> Ongoing    = automatic at startAt
 * Ongoing  -> Completed  = automatic at endAt
 *
 * "Upcoming" is accepted here only for old Firestore records.
 */
export async function syncAutomaticEventStatuses(): Promise<{
  ongoing: number;
  completed: number;
  migratedLegacy: number;
}> {
  const db = getFirestore();
  const now = new Date();
  const nowIso = now.toISOString();

  const snapshot = await db
    .collection('events')
    .where('status', 'in', ['Approved', 'Upcoming', 'Ongoing'])
    .get();

  let ongoing = 0;
  let completed = 0;
  let migratedLegacy = 0;

  await Promise.all(
    snapshot.docs.map(async (eventDoc) => {
      const data = eventDoc.data() as {
        title?: string;
        status?: 'Approved' | 'Upcoming' | 'Ongoing';
        startAt?: string;
        endAt?: string;
      };

      // Existing old events may not have these fields yet.
      // Those records must be edited once to add an End Time.
      if (!data.startAt || !data.endAt) {
        return;
      }

      const startMs = Date.parse(data.startAt);
      const endMs = Date.parse(data.endAt);
      const nowMs = now.getTime();

      if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
        return;
      }

      let nextStatus: 'Approved' | 'Ongoing' | 'Completed' | null = null;

      // Completed takes priority in case the scheduler was temporarily offline.
      if (nowMs >= endMs) {
        nextStatus = 'Completed';
      } else if (nowMs >= startMs) {
        nextStatus = 'Ongoing';
      } else if (data.status === 'Upcoming') {
        // One-time migration of an old Upcoming event.
        nextStatus = 'Approved';
      }

      if (!nextStatus || nextStatus === data.status) {
        return;
      }

      await eventDoc.ref.update({
        status: nextStatus,
        updatedAt: nowIso,
        automaticStatusUpdatedAt: nowIso,
      });

      await db.collection('admin_activity_logs').add({
        adminUid: 'system',
        adminName: 'EcoBantay System',
        action: `Automatically set Event to ${nextStatus}`,
        module: 'Events',
        recordId: eventDoc.id,
        details: `Automatic event lifecycle update for "${data.title || eventDoc.id}"`,
        createdAt: nowIso,
      });

      if (data.status === 'Upcoming' && nextStatus === 'Approved') {
        migratedLegacy += 1;
      } else if (nextStatus === 'Ongoing') {
        ongoing += 1;
      } else if (nextStatus === 'Completed') {
        completed += 1;
      }
    }),
  );

  return {
    ongoing,
    completed,
    migratedLegacy,
  };
}
