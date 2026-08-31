import { addDoc, collection } from 'firebase/firestore';
import { db } from '@/config/firebase';

/**
 * Purpose: Creates an in-app notification for a citizen after admin moderation.
 * How it works: writes one notifications document scoped to the target userId.
 */
export async function createUserNotification(input: {
  userId: string;
  title: string;
  body: string;
  type: 'report' | 'event';
  relatedId?: string;
  statusLabel?: string;
}): Promise<void> {
  if (!input.userId) return;
  await addDoc(collection(db, 'notifications'), {
    userId: input.userId,
    title: input.title,
    body: input.body,
    type: input.type,
    relatedId: input.relatedId ?? null,
    statusLabel: input.statusLabel ?? null,
    read: false,
    createdAt: new Date().toISOString(),
  });
}
