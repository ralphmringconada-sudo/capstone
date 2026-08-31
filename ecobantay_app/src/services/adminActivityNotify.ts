import { addDoc, collection } from 'firebase/firestore';
import { getDbInstance } from '@/config/firebase';

/** Notifies all admins about citizen activity (new report/event). */
export async function notifyAdminsOfActivity(input: {
  title: string;
  body: string;
  type: 'report' | 'event' | 'activity';
  relatedId?: string;
  actorUid?: string;
  actorName?: string;
}): Promise<void> {
  try {
    await addDoc(collection(getDbInstance(), 'admin_notifications'), {
      title: input.title,
      body: input.body,
      type: input.type,
      relatedId: input.relatedId ?? null,
      actorUid: input.actorUid ?? null,
      actorName: input.actorName ?? null,
      read: false,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('notifyAdminsOfActivity failed:', error);
    throw error;
  }
}
