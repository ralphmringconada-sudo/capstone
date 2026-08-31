import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  limit,
} from 'firebase/firestore';
import { getDbInstance } from '@/config/firebase';

export type AppNotification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: 'report' | 'event';
  relatedId?: string;
  statusLabel?: string;
  read: boolean;
  createdAt: string;
};

/**
 * Purpose: Loads recent in-app notifications for the signed-in citizen.
 * How it works: queries notifications by userId, then sorts newest first.
 */
export async function fetchUserNotifications(userId: string, max = 30): Promise<AppNotification[]> {
  const snapshot = await getDocs(
    query(collection(getDbInstance(), 'notifications'), where('userId', '==', userId), limit(max)),
  );

  const items = snapshot.docs.map((item) => {
    const data = item.data() as Omit<AppNotification, 'id'>;
    return { id: item.id, ...data };
  });

  return items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await updateDoc(doc(getDbInstance(), 'notifications', notificationId), { read: true });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const items = await fetchUserNotifications(userId, 50);
  await Promise.all(
    items.filter((item) => !item.read).map((item) => markNotificationRead(item.id)),
  );
}
