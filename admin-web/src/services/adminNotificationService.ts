import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
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
  const snapshot = await getDocs(
    query(collection(db, 'admin_notifications'), orderBy('createdAt', 'desc'), limit(max)),
  );
  return snapshot.docs.map((item) => ({
    id: item.id,
    ...(item.data() as Omit<AdminInboxNotification, 'id'>),
  }));
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
