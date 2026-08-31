import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { AdminInboxNotification } from '@/types/admin';

export async function createAdminNotification(input: {
  title: string;
  body: string;
  type: AdminInboxNotification['type'];
  relatedId?: string;
  actorUid?: string;
  actorName?: string;
}): Promise<void> {
  await addDoc(collection(db, 'admin_notifications'), {
    title: input.title,
    body: input.body,
    type: input.type,
    relatedId: input.relatedId ?? null,
    actorUid: input.actorUid ?? null,
    actorName: input.actorName ?? null,
    read: false,
    createdAt: new Date().toISOString(),
  });
}

export async function fetchAdminNotifications(max = 40): Promise<AdminInboxNotification[]> {
  // Avoid orderBy index requirements; sort newest-first on the client.
  const snapshot = await getDocs(query(collection(db, 'admin_notifications'), limit(Math.max(max, 80))));
  return snapshot.docs
    .map((item) => ({
      id: item.id,
      ...(item.data() as Omit<AdminInboxNotification, 'id'>),
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, max);
}

export async function markAdminNotificationRead(id: string): Promise<void> {
  await updateDoc(doc(db, 'admin_notifications', id), { read: true });
}

export async function markAllAdminNotificationsRead(): Promise<void> {
  const unread = await getDocs(
    query(collection(db, 'admin_notifications'), where('read', '==', false), limit(50)),
  );
  await Promise.all(unread.docs.map((item) => updateDoc(item.ref, { read: true })));
}
