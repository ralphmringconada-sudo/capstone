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
} from 'firebase/firestore';
import {
  sendPasswordResetEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { auth, db } from '@/config/firebase';
import type { ActivityLog, AdminProfile, AppUser, Report, ReportStatus } from '@/types/admin';

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
  // Persist the workflow decision before recording who performed it.
  const reportRef = doc(db, 'reports', reportId);
  await updateDoc(reportRef, {
    status,
    updatedAt: new Date().toISOString(),
  });

  // Record the consequential report action for administrative review.
  await logAdminActivity({
    adminUid: admin.uid,
    adminName: admin.fullName,
    action: `Updated Report Status`,
    module: 'Reports',
    recordId: reportId,
    details: `${details} (Status: ${status})`,
  });
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
  data: Partial<Pick<AdminProfile, 'fullName' | 'contactNumber' | 'username'>>,
  actor: AdminProfile,
) {
  // Persist only the administrator fields intentionally exposed by the settings workflow.
  await updateDoc(doc(db, 'admins', adminId), {
    ...data,
    updatedAt: new Date().toISOString(),
  });

  await logAdminActivity({
    adminUid: actor.uid,
    adminName: actor.fullName,
    action: 'Updated Admin Profile',
    module: 'Users',
    recordId: adminId,
    details: 'Updated administrator information',
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
 * 2. Firebase Authentication sends its configured reset email.
 * Technologies Used: Firebase Authentication and TypeScript.
 * Why this implementation: Firebase-managed recovery avoids handling reset secrets in the application.
 */
export async function sendAdminPasswordReset(email: string) {
  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
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
    ? await getDocs(
        query(base, where('adminUid', '==', adminUid), orderBy('createdAt', 'desc'), limit(50)),
      )
    : await getDocs(query(base, orderBy('createdAt', 'desc'), limit(100)));

  return snapshot.docs.map((item) => ({
    id: item.id,
    ...(item.data() as Omit<ActivityLog, 'id'>),
  }));
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
  token: string,
  payload: {
    fullName: string;
    email: string;
    contactNumber: string;
    username: string;
    password: string;
    status?: 'active' | 'inactive';
  },
) {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
  // Delegate privileged account creation to the backend with the requester's bearer token.
  const response = await fetch(`${apiUrl}/api/admins/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  // Surface backend validation or authorization failures to the calling admin form.
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to create administrator.');
  }

  return data.admin as AdminProfile;
}
