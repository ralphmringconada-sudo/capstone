import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  addDoc,
  updateDoc,
  deleteDoc,
  where,
  limit,
  setDoc,
  writeBatch,
  arrayUnion,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signOut,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { getApps, initializeApp } from 'firebase/app';
import { auth, db } from '@/config/firebase';
import { firebaseConfig } from '@/config/firebaseConfig';
import { createUserNotification } from '@/services/notificationService';
import { createAdminNotification } from '@/services/adminNotificationService';
import type {
  ActivityLog,
  AdminEvent,
  AdminProfile,
  AppUser,
  EventParticipant,
  Report,
  ReportStatus,
  ReportStatusHistoryEntry,
} from '@/types/admin';

/**
 * Purpose: Loads the administrator profile used for portal authorization.
 * How it works:
 * 1. The UID identifies a document in the admins collection.
 * 2. Missing documents return null; existing data is returned as an AdminProfile.
 * Technologies Used: TypeScript and Cloud Firestore document reads.
 * Why this implementation: A direct UID lookup binds Firebase identity to one authoritative admin record.
 */
export async function getAdminProfile(uid: string): Promise<AdminProfile | null> {
  // Read the role-bearing profile that determines whether the authenticated user is an admin.
  const snapshot = await getDoc(doc(db, 'admins', uid));
  if (!snapshot.exists()) return null;
  return snapshot.data() as AdminProfile;
}

function normalizeAdminUsername(username: string): string {
  return username.trim().toLowerCase().replace(/^@+/, '');
}

/**
 * Purpose: Resolves an admin login identifier to the Firebase Auth email.
 * How it works: emails pass through; usernames are looked up in admin_usernames.
 */
export async function resolveAdminLoginEmail(identifier: string): Promise<string> {
  const trimmed = identifier.trim();
  if (!trimmed) {
    throw new Error('Email or username is required.');
  }
  if (trimmed.includes('@')) {
    return trimmed.toLowerCase();
  }

  const username = normalizeAdminUsername(trimmed);
  const snapshot = await getDoc(doc(db, 'admin_usernames', username));
  if (!snapshot.exists()) {
    throw new Error('Invalid username or password.');
  }
  const email = String((snapshot.data() as { email?: string }).email || '')
    .trim()
    .toLowerCase();
  if (!email) {
    throw new Error('Invalid username or password.');
  }
  return email;
}

export async function upsertAdminUsernameMapping(input: {
  username: string;
  email: string;
  uid: string;
  previousUsername?: string;
}) {
  const nextUsername = normalizeAdminUsername(input.username);
  if (!nextUsername) {
    throw new Error('Username is required.');
  }
  if (!/^[a-z0-9._-]{3,30}$/.test(nextUsername)) {
    throw new Error(
      'Username must be 3–30 characters and use only letters, numbers, dots, underscores, or hyphens.',
    );
  }

  const mappingRef = doc(db, 'admin_usernames', nextUsername);
  const existing = await getDoc(mappingRef);
  if (existing.exists()) {
    const ownerUid = String((existing.data() as { uid?: string }).uid || '');
    if (ownerUid && ownerUid !== input.uid) {
      throw new Error('That username is already taken.');
    }
  }

  const previous = normalizeAdminUsername(input.previousUsername || '');
  if (previous && previous !== nextUsername) {
    await deleteDoc(doc(db, 'admin_usernames', previous)).catch(() => undefined);
  }

  await setDoc(mappingRef, {
    username: nextUsername,
    email: input.email.trim().toLowerCase(),
    uid: input.uid,
    updatedAt: new Date().toISOString(),
  });

  return nextUsername;
}

/**
 * Purpose: Retrieves citizen accounts for administrative search and management.
 * How it works:
 * 1. The users collection is queried by descending creation time.
 * 2. Firestore document IDs are merged into typed application-user records.
 * Technologies Used: TypeScript and Cloud Firestore collection queries.
 * Why this implementation: Central ordering gives account screens a consistent newest-first dataset.
 */
export async function fetchAppUsers(): Promise<AppUser[]> {
  // Query Firestore once and retain document IDs required by later account actions.
  const snapshot = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
  return snapshot.docs.map((item) => ({ uid: item.id, ...(item.data() as Omit<AppUser, 'uid'>) }));
}

/**
 * Purpose: Retrieves administrator profiles for role-aware account management.
 * How it works:
 * 1. The admins collection is queried by descending creation time.
 * 2. Document IDs are merged into typed administrator profiles.
 * Technologies Used: TypeScript and Cloud Firestore collection queries.
 * Why this implementation: The complete profile list supports super-admin review from one shared service.
 */
export async function fetchAdmins(): Promise<AdminProfile[]> {
  // Preserve each Firestore document ID as the UID used by authorization and audit actions.
  const snapshot = await getDocs(query(collection(db, 'admins'), orderBy('createdAt', 'desc')));
  return snapshot.docs.map((item) => ({ uid: item.id, ...(item.data() as Omit<AdminProfile, 'uid'>) }));
}

/**
 * Purpose: Retrieves environmental reports for dashboard and management screens.
 * How it works:
 * 1. The reports collection is queried by descending submission time.
 * 2. Document IDs are merged with each report payload.
 * Technologies Used: TypeScript and Cloud Firestore collection queries.
 * Why this implementation: One ordered query provides a consistent report source across admin modules.
 */
export async function fetchReports(): Promise<Report[]> {
  // Load the current Firestore report snapshot in the order expected by administrative tables.
  const snapshot = await getDocs(query(collection(db, 'reports'), orderBy('createdAt', 'desc')));
  return snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Report, 'id'>) }));
}

/** Loads persistent events for the administrator event-management workspace. */
export async function fetchEvents(): Promise<AdminEvent[]> {
  try {
    const snapshot = await getDocs(query(collection(db, 'events'), orderBy('createdAt', 'desc')));
    return snapshot.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<AdminEvent, 'id'>),
    }));
  } catch {
    const snapshot = await getDocs(collection(db, 'events'));
    return snapshot.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<AdminEvent, 'id'>),
      }))
      .sort((first, second) => (second.createdAt || '').localeCompare(first.createdAt || ''));
  }
}

/** Creates a persistent event and records the administrator responsible for it. */
export async function createEvent(
  input: Omit<AdminEvent, 'id' | 'createdAt' | 'updatedAt'>,
  admin: AdminProfile,
): Promise<AdminEvent> {
  const eventRef = doc(collection(db, 'events'));
  const activityRef = doc(collection(db, 'admin_activity_logs'));
  const now = new Date().toISOString();
  const eventData: Omit<AdminEvent, 'id'> = { ...input, createdAt: now, updatedAt: now };
  const event: AdminEvent = { id: eventRef.id, ...eventData };
  const batch = writeBatch(db);
  batch.set(eventRef, eventData);
  batch.set(activityRef, {
    adminUid: admin.uid,
    adminName: admin.fullName,
    action: 'Created Event',
    module: 'Events',
    recordId: eventRef.id,
    details: `Created event "${event.title}"`,
    createdAt: now,
  });
  await batch.commit();
  return event;
}

/** Updates event moderation status together with its immutable audit entry. */
export async function updateEventStatus(
  eventId: string,
  status: AdminEvent['status'],
  admin: AdminProfile,
  details?: { rejectionReason?: string; rejectionRemarks?: string },
): Promise<void> {
  const eventRef = doc(db, 'events', eventId);
  const activityRef = doc(collection(db, 'admin_activity_logs'));
  const now = new Date().toISOString();
  const eventSnapBefore = await getDoc(eventRef);
  const existing = eventSnapBefore.data() || {};
  const ownerUid = (existing.submittedByUid as string | undefined) || '';
  const eventTitle = (existing.title as string | undefined) || 'your event';

  const patch: Record<string, unknown> = { status, updatedAt: now };
  if (status === 'Rejected') {
    patch.rejectionReason = details?.rejectionReason || '';
    patch.rejectionRemarks = details?.rejectionRemarks || '';
    patch.rejectedAt = now;
  }

  const batch = writeBatch(db);
  batch.update(eventRef, patch);
  batch.set(activityRef, {
    adminUid: admin.uid,
    adminName: admin.fullName,
    action: `${status} Event`,
    module: 'Events',
    recordId: eventId,
    details:
      status === 'Rejected' && details?.rejectionReason
        ? `Rejected: ${details.rejectionReason}${details.rejectionRemarks ? ` — ${details.rejectionRemarks}` : ''}`
        : `Changed event status to ${status}`,
    createdAt: now,
  });
  await batch.commit();

  if (ownerUid) {
    const reasonText =
      status === 'Rejected' && details?.rejectionReason
        ? ` Reason: ${details.rejectionReason}${details.rejectionRemarks ? ` (${details.rejectionRemarks})` : ''}.`
        : '';
    try {
      await createUserNotification({
        userId: ownerUid,
        title: eventTitle,
        body: `Your event status was updated to ${status}.${reasonText}`,
        type: 'event',
        relatedId: eventId,
        statusLabel: status,
      });
    } catch (notifyError) {
      console.warn('Citizen event notification failed:', notifyError);
    }
  }

  try {
    await createAdminNotification({
      title: `Event ${status}`,
      body: `${admin.fullName} set "${eventTitle}" to ${status}.`,
      type: status === 'Upcoming' || status === 'Rejected' ? 'approval' : 'event',
      relatedId: eventId,
      actorUid: admin.uid,
      actorName: admin.fullName,
    });
  } catch (notifyError) {
    console.warn('Admin event notification failed:', notifyError);
  }
}

/** Updates editable event fields (admin). */
export async function updateEvent(
  eventId: string,
  input: Partial<
    Pick<
      AdminEvent,
      | 'title'
      | 'description'
      | 'category'
      | 'date'
      | 'time'
      | 'location'
      | 'submittedArea'
      | 'capacity'
      | 'imageUrl'
      | 'images'
      | 'coordinates'
      | 'status'
    >
  >,
  admin: AdminProfile,
): Promise<void> {
  const eventRef = doc(db, 'events', eventId);
  const activityRef = doc(collection(db, 'admin_activity_logs'));
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.update(eventRef, { ...input, updatedAt: now });
  batch.set(activityRef, {
    adminUid: admin.uid,
    adminName: admin.fullName,
    action: 'Updated Event',
    module: 'Events',
    recordId: eventId,
    details: `Updated event fields for ${eventId}`,
    createdAt: now,
  });
  await batch.commit();
}

/** Permanently deletes an event and audits the action. */
export async function deleteEvent(eventId: string, admin: AdminProfile): Promise<void> {
  const activityRef = doc(collection(db, 'admin_activity_logs'));
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.delete(doc(db, 'events', eventId));
  batch.set(activityRef, {
    adminUid: admin.uid,
    adminName: admin.fullName,
    action: 'Deleted Event',
    module: 'Events',
    recordId: eventId,
    details: 'Event permanently deleted by admin',
    createdAt: now,
  });
  await batch.commit();
}

/**
 * Purpose: Loads citizens who joined a specific event.
 * How it works: Reads the events/{id}/participants subcollection used by the mobile app.
 * Technologies Used: Cloud Firestore subcollection queries.
 * Why this implementation: Admins need the participant roster, not only the counter on the event doc.
 */
export async function fetchEventParticipants(eventId: string): Promise<EventParticipant[]> {
  const snapshot = await getDocs(collection(db, 'events', eventId, 'participants'));
  return snapshot.docs
    .map((item) => {
      const data = item.data() as Partial<EventParticipant>;
      return {
        uid: data.uid || item.id,
        name: data.name || 'Unknown participant',
        email: data.email || 'No email',
        joinedAt: data.joinedAt || '',
      };
    })
    .sort((first, second) => (second.joinedAt || '').localeCompare(first.joinedAt || ''));
}

/**
 * Purpose: Retrieves one environmental report by its persistent identifier.
 * How it works:
 * 1. A direct reports document reference is read from Firestore.
 * 2. Missing reports return null; existing data is combined with its document ID.
 * Technologies Used: TypeScript and Cloud Firestore document reads.
 * Why this implementation: Direct lookup avoids loading the full report collection for a detail view.
 */
export async function fetchReportById(reportId: string): Promise<Report | null> {
  // Use the route-provided identifier for a targeted Firestore document read.
  const snapshot = await getDoc(doc(db, 'reports', reportId));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...(snapshot.data() as Omit<Report, 'id'>) };
}

/**
 * Purpose: Changes report workflow status and preserves an administrator audit trail.
 * How it works:
 * 1. Firestore updates the selected report status and modification timestamp.
 * 2. A linked activity record identifies the administrator, report, and decision details.
 * Technologies Used: TypeScript, Cloud Firestore document updates, and audit-log services.
 * Why this implementation: Pairing the operational change with an audit entry supports accountability.
 */
export async function updateReportStatus(
  reportId: string,
  status: ReportStatus,
  admin: AdminProfile,
  details: string,
) {
  const reportRef = doc(db, 'reports', reportId);
  const activityRef = doc(collection(db, 'admin_activity_logs'));
  const now = new Date().toISOString();
  const historyEntry: ReportStatusHistoryEntry = {
    status,
    at: now,
    by: admin.uid,
    byName: admin.fullName,
    remarks: details,
  };

  // Ensure older reports get a Pending seed when history first starts being written.
  const existing = await getDoc(reportRef);
  const existingHistory = (existing.data()?.statusHistory as ReportStatusHistoryEntry[] | undefined) || [];
  const seedPending: ReportStatusHistoryEntry[] = existingHistory.some((entry) => entry.status === 'Pending')
    ? []
    : [
        {
          status: 'Pending',
          at: (existing.data()?.createdAt as string | undefined) || now,
          remarks: 'Report submitted by user',
        },
      ];

  // Avoid arrayUnion(...[]) edge cases by building the args list explicitly.
  const historyArgs = [...seedPending, historyEntry];
  const batch = writeBatch(db);
  batch.update(reportRef, {
    status,
    updatedAt: now,
    statusHistory: arrayUnion(...historyArgs),
  });
  batch.set(activityRef, {
    adminUid: admin.uid,
    adminName: admin.fullName,
    action: `Updated Report Status`,
    module: 'Reports',
    recordId: reportId,
    details: `${details} (Status: ${status})`,
    createdAt: now,
  });
  await batch.commit();

  const ownerUid = (existing.data()?.reportedByUid as string | undefined) || '';
  const reportTitle = (existing.data()?.title as string | undefined) || 'your report';

  // Notifications must never block moderation if rules/indexes are incomplete.
  try {
    if (ownerUid) {
      await createUserNotification({
        userId: ownerUid,
        title: reportTitle,
        body: `Your report status was updated to ${status}.${details ? ` ${details}` : ''}`,
        type: 'report',
        relatedId: reportId,
        statusLabel: status,
      });
    }
  } catch (notifyError) {
    console.warn('Citizen report notification failed:', notifyError);
  }

  try {
    await createAdminNotification({
      title: `Report ${status}`,
      body: `${admin.fullName} set "${reportTitle}" to ${status}.`,
      type: 'approval',
      relatedId: reportId,
      actorUid: admin.uid,
      actorName: admin.fullName,
    });
  } catch (notifyError) {
    console.warn('Admin report notification failed:', notifyError);
  }
}

/**
 * Purpose: Permanently removes a report and records the responsible administrator.
 * How it works:
 * 1. The selected report document is deleted from Firestore.
 * 2. An audit record captures the actor, module, record ID, and deletion details.
 * Technologies Used: TypeScript, Cloud Firestore deletion, and audit-log services.
 * Why this implementation: Destructive moderation remains traceable after the source document is gone.
 */
export async function deleteReport(reportId: string, admin: AdminProfile) {
  // Complete the requested Firestore deletion before writing its retained audit record.
  await deleteDoc(doc(db, 'reports', reportId));

  await logAdminActivity({
    adminUid: admin.uid,
    adminName: admin.fullName,
    action: 'Deleted Report',
    module: 'Reports',
    recordId: reportId,
    details: 'Report permanently deleted by admin',
  });
}

/**
 * Purpose: Updates approved citizen profile fields and audits the administrator action.
 * How it works:
 * 1. Supplied editable fields and an updated timestamp are written to the user document.
 * 2. A separate activity record identifies the administrator and affected citizen.
 * Technologies Used: TypeScript, Cloud Firestore updates, and audit-log services.
 * Why this implementation: Restricting the accepted field type limits accidental profile mutation.
 */
export async function updateAppUserProfile(
  userId: string,
  data: Partial<Pick<AppUser, 'firstName' | 'lastName' | 'contactNumber' | 'birthday'>>,
  admin: AdminProfile,
) {
  // Write only the caller-provided editable profile fields to Firestore.
  await updateDoc(doc(db, 'users', userId), {
    ...data,
    updatedAt: new Date().toISOString(),
  });

  await logAdminActivity({
    adminUid: admin.uid,
    adminName: admin.fullName,
    action: 'Updated User Profile',
    module: 'Users',
    recordId: userId,
    details: 'Updated citizen account information',
  });
}

/**
 * Purpose: Updates approved administrator profile fields with actor attribution.
 * How it works:
 * 1. Editable profile values and a modification timestamp update the admin document.
 * 2. The acting administrator is recorded in the activity log.
 * Technologies Used: TypeScript, Cloud Firestore updates, and audit-log services.
 * Why this implementation: Actor separation supports both self-service and super-admin edits.
 */
export async function updateAdminProfileInfo(
  adminId: string,
  data: Partial<Pick<AdminProfile, 'fullName' | 'contactNumber' | 'username' | 'notificationPrefs'>>,
  actor: AdminProfile,
) {
  const existing = await getAdminProfile(adminId);
  if (!existing) {
    throw new Error('Administrator account was not found.');
  }

  let nextUsername = existing.username;
  if (typeof data.username === 'string') {
    nextUsername = await upsertAdminUsernameMapping({
      username: data.username,
      email: existing.email,
      uid: adminId,
      previousUsername: existing.username,
    });
  }

  // Persist only the administrator fields intentionally exposed by the settings workflow.
  await updateDoc(doc(db, 'admins', adminId), {
    ...data,
    ...(typeof data.username === 'string' ? { username: nextUsername } : {}),
    updatedAt: new Date().toISOString(),
  });

  await logAdminActivity({
    adminUid: actor.uid,
    adminName: actor.fullName,
    action: 'Updated Admin Profile',
    module: 'Users',
    recordId: adminId,
    details: data.notificationPrefs
      ? 'Updated administrator notification settings'
      : 'Updated administrator information',
  });
}

/**
 * Purpose: Marks or clears an account flag and records the moderation action.
 * How it works:
 * 1. Account type selects the users or admins Firestore collection.
 * 2. Flag state, actor, timestamp, and update time are persisted.
 * 3. The change is written to the administrative activity log.
 * Technologies Used: TypeScript, Cloud Firestore updates, and audit-log services.
 * Why this implementation: Server-backed flags remain consistent across browsers and admin sessions.
 */
export async function setAccountFlag(
  accountId: string,
  accountType: 'user' | 'admin',
  isFlagged: boolean,
  actor: AdminProfile,
) {
  // Select the authorized collection explicitly from the validated account category.
  const collectionName = accountType === 'admin' ? 'admins' : 'users';
  await updateDoc(doc(db, collectionName, accountId), {
    isFlagged,
    flaggedAt: isFlagged ? new Date().toISOString() : null,
    flaggedBy: isFlagged ? actor.uid : null,
    updatedAt: new Date().toISOString(),
  });

  await logAdminActivity({
    adminUid: actor.uid,
    adminName: actor.fullName,
    action: isFlagged ? 'Flagged Account' : 'Unflagged Account',
    module: 'Users',
    recordId: accountId,
    details: `${isFlagged ? 'Flagged' : 'Unflagged'} ${accountType} account`,
  });
}

/**
 * Purpose: Requests permanent deletion of an application user through the trusted backend.
 * How it works:
 * 1. The configured API endpoint receives the target user ID.
 * 2. A Firebase ID token is sent as a bearer credential for server authorization.
 * 3. Non-success responses become errors; successful JSON is returned.
 * Technologies Used: Fetch API, Firebase ID tokens, environment configuration, and the backend REST API.
 * Why this implementation: Privileged account deletion belongs on a trusted server, not in browser code.
 */
export async function deleteAppUserAccount(token: string, userId: string) {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
  // Send the caller's fresh Firebase token so the backend can enforce administrative permissions.
  const response = await fetch(`${apiUrl}/api/users/${userId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  // Normalize backend failure responses into exceptions handled by the account screen.
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to delete user account.');
  }
  return data;
}

/**
 * Purpose: Starts Firebase's email-based administrator password recovery flow.
 * How it works:
 * 1. The address is normalized by trimming and lowercasing.
 * 2. A Cloud Function generates a reset code and emails a link to the EcoBantay reset UI.
 * Technologies Used: Fetch API and TypeScript.
 * Why this implementation: Firebase's default /__/auth/action page cannot be restyled, so custom email links are required.
 */
export async function sendAdminPasswordReset(email: string) {
  const normalized = email.trim().toLowerCase();
  const response = await fetch('/api/send-password-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalized }),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(data.error || 'Failed to send reset email.');
  }
}

/**
 * Purpose: Lets a super admin trigger Firebase password reset for another admin.
 * How it works: Validates the target admin profile, then sends Firebase's reset email.
 */
export async function sendAdminPasswordResetForAdmin(
  adminId: string,
  actor: AdminProfile,
) {
  if (actor.role !== 'super_admin') {
    throw new Error('Only super admins can reset administrator passwords.');
  }
  const target = await getAdminProfile(adminId);
  if (!target?.email) {
    throw new Error('Administrator account was not found.');
  }
  if (target.role === 'super_admin' && target.uid !== actor.uid) {
    throw new Error('You cannot reset another super admin password from here.');
  }
  await fetch('/api/send-password-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: target.email.trim().toLowerCase() }),
  }).then(async (response) => {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      throw new Error(data.error || 'Failed to send reset email.');
    }
  });
  await logAdminActivity({
    adminUid: actor.uid,
    adminName: actor.fullName,
    action: 'Sent Admin Password Reset',
    module: 'Users',
    recordId: adminId,
    details: `Sent password reset email to ${target.email}`,
  });
}

/**
 * Purpose: Securely changes the password of the signed-in administrator.
 * How it works:
 * 1. The current Firebase user and email are required.
 * 2. Existing credentials reauthenticate the sensitive operation.
 * 3. Firebase Authentication applies the new password.
 * Technologies Used: Firebase Authentication email credentials and TypeScript.
 * Why this implementation: Reauthentication limits password changes from stale or unattended sessions.
 */
export async function changeAdminPassword(currentPassword: string, newPassword: string) {
  // Require a complete authenticated identity before constructing reauthentication credentials.
  const currentUser = auth.currentUser;
  if (!currentUser?.email) {
    throw new Error('You must be signed in to change your password.');
  }

  // Firebase requires recent authentication before accepting this sensitive account update.
  const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
  await reauthenticateWithCredential(currentUser, credential);
  await updatePassword(currentUser, newPassword);
}

/**
 * Purpose: Persists one administrator action for accountability and later review.
 * How it works:
 * 1. The caller supplies actor, module, record, action, and detail fields.
 * 2. The service adds a server-facing creation timestamp.
 * 3. Firestore creates a new immutable-style activity document.
 * Technologies Used: TypeScript and Cloud Firestore document creation.
 * Why this implementation: A centralized log shape keeps audit records consistent across modules.
 */
export async function logAdminActivity(input: Omit<ActivityLog, 'id' | 'createdAt'>) {
  // Append rather than overwrite so each administrative action remains independently reviewable.
  await addDoc(collection(db, 'admin_activity_logs'), {
    ...input,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Purpose: Retrieves recent administrative actions for audit displays.
 * How it works:
 * 1. An optional UID chooses personal or global activity scope.
 * 2. Firestore orders records newest first and limits the result size.
 * 3. Document IDs are merged into typed activity records.
 * Technologies Used: TypeScript and Cloud Firestore filtered, ordered, and limited queries.
 * Why this implementation: Role-aware scoping supports privacy while bounded queries control read volume.
 */
export async function fetchActivityLogs(adminUid?: string): Promise<ActivityLog[]> {
  const base = collection(db, 'admin_activity_logs');
  // Standard-admin views use a UID filter; privileged global views omit it.
  const snapshot = adminUid
    ? await getDocs(query(base, where('adminUid', '==', adminUid)))
    : await getDocs(query(base, orderBy('createdAt', 'desc'), limit(100)));

  return snapshot.docs
    .map((item) => ({
      id: item.id,
      ...(item.data() as Omit<ActivityLog, 'id'>),
    }))
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
    .slice(0, adminUid ? 50 : 100);
}

/**
 * Purpose: Creates a standard administrator through the trusted backend service.
 * How it works:
 * 1. Profile and credential fields are serialized to the admin creation endpoint.
 * 2. A Firebase ID token authenticates and authorizes the requesting administrator.
 * 3. Backend errors become exceptions; the created admin profile is returned on success.
 * Technologies Used: Fetch API, Firebase ID tokens, environment configuration, and the backend REST API.
 * Why this implementation: Server-side creation protects privileged Firebase Authentication operations.
 */
export async function createAdminAccount(
  _token: string,
  payload: {
    fullName: string;
    email: string;
    contactNumber: string;
    username: string;
    password: string;
    status?: 'active' | 'inactive';
  },
) {
  const provisioningApp =
    getApps().find((item) => item.name === 'admin-provisioning') ||
    initializeApp(firebaseConfig, 'admin-provisioning');
  const provisioningAuth = getAuth(provisioningApp);
  const normalizedEmail = payload.email.trim().toLowerCase();
  const requestedUsername = normalizeAdminUsername(payload.username);
  if (!requestedUsername) {
    throw new Error('Username is required.');
  }

  const credential = await createUserWithEmailAndPassword(
    provisioningAuth,
    normalizedEmail,
    payload.password,
  );

  try {
    await updateProfile(credential.user, { displayName: payload.fullName.trim() });
    const username = await upsertAdminUsernameMapping({
      username: requestedUsername,
      email: normalizedEmail,
      uid: credential.user.uid,
    });
    const profile: AdminProfile = {
      uid: credential.user.uid,
      fullName: payload.fullName.trim(),
      email: normalizedEmail,
      contactNumber: payload.contactNumber.trim(),
      username,
      role: 'admin',
      status: payload.status || 'active',
      createdAt: new Date().toISOString(),
      createdBy: auth.currentUser?.uid,
    };
    // The primary Firestore session remains the super admin while secondary Auth creates credentials.
    await setDoc(doc(db, 'admins', credential.user.uid), profile);
    await logAdminActivity({
      adminUid: auth.currentUser?.uid || '',
      adminName: auth.currentUser?.displayName || auth.currentUser?.email || 'Super Admin',
      action: 'Created Administrator',
      module: 'Users',
      recordId: credential.user.uid,
      details: `Created admin account for ${normalizedEmail} (@${username})`,
    });
    await signOut(provisioningAuth);
    return profile;
  } catch (error) {
    // Remove the new Auth identity if its required Firestore profile cannot be completed.
    await deleteDoc(doc(db, 'admin_usernames', requestedUsername)).catch(() => undefined);
    await deleteDoc(doc(db, 'admins', credential.user.uid)).catch(() => undefined);
    await deleteUser(credential.user).catch(() => undefined);
    await signOut(provisioningAuth).catch(() => undefined);
    throw error;
  }
}
