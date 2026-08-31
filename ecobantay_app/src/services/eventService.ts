import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDbInstance } from '@/config/firebase';
import { uploadEventImage } from '@/services/firebaseStorageService';
import { notifyAdminsOfActivity } from '@/services/adminActivityNotify';
import type {
  EcoEvent,
  EventParticipant,
  SubmitEventInput,
  UpdateEventInput,
} from '@/types/event';

const VALENCIA_CITY = 'Valencia, Negros Oriental';

function mapEventDoc(id: string, data: Omit<EcoEvent, 'id'>): EcoEvent {
  return { id, ...data };
}

function sortByNewest(events: EcoEvent[]): EcoEvent[] {
  return events.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/**
 * Purpose: Persists a citizen-submitted event that starts in Pending moderation.
 * How it works: 1) optional image upload. 2) writes Firestore with Pending status. 3) returns the new ID.
 * Technologies Used: Firebase Storage, Firebase Firestore, TypeScript.
 * Why this implementation: Matching the admin AdminEvent shape keeps one shared events collection.
 */
export async function submitEvent(input: SubmitEventInput): Promise<string> {
  const uris = (input.imageUris || []).filter(Boolean).slice(0, 5);
  const imageUrls: string[] = [];
  for (const uri of uris) {
    imageUrls.push(await uploadEventImage(uri, input.user.uid));
  }

  const now = new Date().toISOString();
  const fullName = `${input.user.firstName} ${input.user.lastName}`.trim() || 'Citizen';
  const location =
    input.location.trim() ||
    `${input.barangay.trim()}${input.barangay.trim() ? ', ' : ''}${VALENCIA_CITY}`;

  const eventData: Omit<EcoEvent, 'id'> = {
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category,
    date: input.date.trim(),
    time: input.time.trim(),
    location,
    status: 'Pending',
    participants: 0,
    capacity: Math.max(1, input.capacity || 50),
    submittedBy: fullName,
    submittedArea: input.barangay.trim() || 'Valencia',
    submittedByUid: input.user.uid,
    imageUrl: imageUrls[0],
    images: imageUrls,
    coordinates: input.coordinates,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await addDoc(collection(getDbInstance(), 'events'), eventData);

  try {
    await notifyAdminsOfActivity({
      title: 'New event submitted',
      body: `${fullName} submitted "${eventData.title}" for approval.`,
      type: 'event',
      relatedId: docRef.id,
      actorUid: input.user.uid,
      actorName: fullName,
    });
  } catch {
    // Do not block event creation if admin notify fails.
  }

  return docRef.id;
}

/** Loads events created by the signed-in user. */
export async function fetchUserEvents(userId: string): Promise<EcoEvent[]> {
  const snapshot = await getDocs(
    query(collection(getDbInstance(), 'events'), where('submittedByUid', '==', userId)),
  );

  return sortByNewest(
    snapshot.docs.map((item) => mapEventDoc(item.id, item.data() as Omit<EcoEvent, 'id'>)),
  );
}

/**
 * Purpose: Loads admin-accepted events that other citizens may browse and join.
 * How it works: queries Upcoming and Ongoing separately, then merges and sorts.
 * Technologies Used: Firebase Firestore queries.
 * Why this implementation: Avoids composite indexes while keeping Pending/Rejected hidden from the public list.
 */
export async function fetchAcceptedEvents(): Promise<EcoEvent[]> {
  const [upcoming, ongoing, completed] = await Promise.all([
    getDocs(query(collection(getDbInstance(), 'events'), where('status', '==', 'Upcoming'))),
    getDocs(query(collection(getDbInstance(), 'events'), where('status', '==', 'Ongoing'))),
    getDocs(query(collection(getDbInstance(), 'events'), where('status', '==', 'Completed'))),
  ]);

  const byId = new Map<string, EcoEvent>();
  for (const snapshot of [upcoming, ongoing, completed]) {
    for (const item of snapshot.docs) {
      byId.set(item.id, mapEventDoc(item.id, item.data() as Omit<EcoEvent, 'id'>));
    }
  }

  return sortByNewest([...byId.values()]);
}

/**
 * Purpose: Builds the Events dashboard list for one user.
 * How it works: merges owned events with accepted public events (deduped by ID).
 */
export async function fetchEventsForHome(userId: string): Promise<EcoEvent[]> {
  const [mine, accepted] = await Promise.all([
    fetchUserEvents(userId),
    fetchAcceptedEvents(),
  ]);

  const byId = new Map<string, EcoEvent>();
  for (const event of [...mine, ...accepted]) {
    byId.set(event.id, event);
  }
  return sortByNewest([...byId.values()]);
}

export async function fetchEventById(eventId: string): Promise<EcoEvent | null> {
  const snapshot = await getDoc(doc(getDbInstance(), 'events', eventId));
  if (!snapshot.exists()) return null;
  return mapEventDoc(snapshot.id, snapshot.data() as Omit<EcoEvent, 'id'>);
}

/** Owner may update Pending events only. */
export async function updateUserEvent(
  eventId: string,
  userId: string,
  input: UpdateEventInput,
): Promise<void> {
  const event = await fetchEventById(eventId);
  if (!event || event.submittedByUid !== userId) {
    throw new Error('Event not found or you do not have permission to edit it.');
  }
  if (event.status !== 'Pending') {
    throw new Error('Only pending events can be edited.');
  }

  const location =
    input.location.trim() ||
    `${input.barangay.trim()}${input.barangay.trim() ? ', ' : ''}${VALENCIA_CITY}`;

  await updateDoc(doc(getDbInstance(), 'events', eventId), {
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category,
    date: input.date.trim(),
    time: input.time.trim(),
    location,
    submittedArea: input.barangay.trim() || event.submittedArea,
    capacity: Math.max(1, input.capacity || event.capacity),
    ...(input.coordinates ? { coordinates: input.coordinates } : {}),
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteUserEvent(eventId: string, userId: string): Promise<void> {
  const event = await fetchEventById(eventId);
  if (!event || event.submittedByUid !== userId) {
    throw new Error('Event not found or you do not have permission to delete it.');
  }
  if (event.status !== 'Pending') {
    throw new Error('Only pending events can be deleted.');
  }
  await deleteDoc(doc(getDbInstance(), 'events', eventId));
}

export async function fetchEventParticipants(eventId: string): Promise<EventParticipant[]> {
  const snapshot = await getDocs(collection(getDbInstance(), 'events', eventId, 'participants'));
  return snapshot.docs
    .map((item) => {
      const data = item.data() as Partial<EventParticipant>;
      return {
        uid: data.uid || item.id,
        name: data.name || 'Participant',
        email: data.email || '',
        joinedAt: data.joinedAt || '',
      };
    })
    .sort((a, b) => (b.joinedAt || '').localeCompare(a.joinedAt || ''));
}

export async function hasJoinedEvent(eventId: string, userId: string): Promise<boolean> {
  const snapshot = await getDoc(doc(getDbInstance(), 'events', eventId, 'participants', userId));
  return snapshot.exists();
}

export async function fetchJoinedEventIds(userId: string, eventIds: string[]): Promise<Set<string>> {
  const joined = new Set<string>();
  await Promise.all(
    eventIds.map(async (eventId) => {
      if (await hasJoinedEvent(eventId, userId)) {
        joined.add(eventId);
      }
    }),
  );
  return joined;
}

/**
 * Purpose: Registers the signed-in user as a participant of an accepted event.
 * How it works: transaction writes participants/{uid} and increments the event counter.
 */
export async function joinEvent(
  eventId: string,
  user: { uid: string; firstName: string; lastName: string; email: string },
): Promise<void> {
  const db = getDbInstance();
  const eventRef = doc(db, 'events', eventId);
  const participantRef = doc(db, 'events', eventId, 'participants', user.uid);

  await runTransaction(db, async (tx) => {
    const eventSnap = await tx.get(eventRef);
    if (!eventSnap.exists()) {
      throw new Error('Event not found.');
    }

    const data = eventSnap.data() as EcoEvent;
    if (data.status !== 'Upcoming' && data.status !== 'Ongoing') {
      throw new Error('Only accepted events can be joined.');
    }
    if ((data.participants || 0) >= (data.capacity || 0)) {
      throw new Error('This event is already full.');
    }

    const existing = await tx.get(participantRef);
    if (existing.exists()) {
      throw new Error('You already joined this event.');
    }

    const participant: EventParticipant = {
      uid: user.uid,
      name: `${user.firstName} ${user.lastName}`.trim() || 'Citizen',
      email: user.email,
      joinedAt: new Date().toISOString(),
    };

    tx.set(participantRef, participant);
    tx.update(eventRef, {
      participants: (data.participants || 0) + 1,
      updatedAt: new Date().toISOString(),
    });
  });
}

export async function leaveEvent(eventId: string, userId: string): Promise<void> {
  const db = getDbInstance();
  const eventRef = doc(db, 'events', eventId);
  const participantRef = doc(db, 'events', eventId, 'participants', userId);

  await runTransaction(db, async (tx) => {
    const eventSnap = await tx.get(eventRef);
    if (!eventSnap.exists()) {
      throw new Error('Event not found.');
    }

    const existing = await tx.get(participantRef);
    if (!existing.exists()) {
      throw new Error('You have not joined this event.');
    }

    const data = eventSnap.data() as EcoEvent;
    tx.delete(participantRef);
    tx.update(eventRef, {
      participants: Math.max(0, (data.participants || 1) - 1),
      updatedAt: new Date().toISOString(),
    });
  });
}

export async function countUserCreatedEvents(userId: string): Promise<number> {
  const events = await fetchUserEvents(userId);
  return events.length;
}

export async function countUserJoinedEvents(userId: string): Promise<number> {
  const accepted = await fetchAcceptedEvents();
  const joined = await fetchJoinedEventIds(
    userId,
    accepted.map((item) => item.id),
  );
  return joined.size;
}
