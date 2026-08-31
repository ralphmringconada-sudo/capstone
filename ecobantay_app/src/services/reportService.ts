import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDbInstance } from '@/config/firebase';
import { uploadReportImage } from '@/services/firebaseStorageService';
import { notifyAdminsOfActivity } from '@/services/adminActivityNotify';
import type { EcoReport, SubmitReportInput } from '@/types/report';

const VALENCIA_CITY = 'Valencia, Negros Oriental';

/**
 * Purpose: Formats the capture time displayed on report proof images.
 * How it works: 1) Uses the supplied or current date. 2) includes full date and 12-hour time components.
 * Technologies Used: JavaScript Date internationalization.
 * Why this implementation: A visible, readable timestamp supports evidence review by administrators.
 */
export function formatReportTimestamp(date = new Date()): string {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/**
 * Purpose: Converts an ISO report date into the dashboard's compact date format.
 * How it works: 1) parses the ISO value. 2) preserves invalid input. 3) pads day and month values.
 * Technologies Used: JavaScript Date and TypeScript.
 * Why this implementation: Defensive formatting prevents malformed legacy values from breaking report display.
 */
export function formatReportDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day} / ${month} / ${year}`;
}

/**
 * Purpose: Creates the location text attached to image evidence.
 * How it works: 1) prefers a readable address. 2) falls back to six-decimal GPS coordinates.
 * Technologies Used: TypeScript and geographic coordinate data.
 * Why this implementation: Evidence remains location-aware even when reverse geocoding has no address result.
 */
export function buildImageLocationText(
  locationText: string,
  coordinates: { latitude: number; longitude: number },
): string {
  if (locationText.trim()) {
    return `Location: ${locationText}`;
  }
  return `Coordinates: ${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}`;
}

/**
 * Purpose: Persists a complete environmental report and its proof image(s).
 * How it works: 1) uploads each evidence photo. 2) assembles report metadata. 3) writes Firestore. 4) returns the ID.
 * Technologies Used: Firebase Storage, Firebase Firestore, TypeScript.
 * Why this implementation: Uploading evidence first ensures every stored report references available images.
 */
export async function submitReport(input: SubmitReportInput): Promise<string> {
  const uris = input.imageUris.filter(Boolean);
  if (!uris.length) {
    throw new Error('At least one proof photo is required.');
  }

  /*
   * Firebase Storage uploads: persist every captured proof before creating Firestore
   * metadata so a report cannot point to images that failed to upload.
   */
  const imageUrls: string[] = [];
  for (const uri of uris) {
    imageUrls.push(await uploadReportImage(uri, input.user.uid));
  }

  const imageLocation = buildImageLocationText(input.locationText, input.coordinates);
  const now = new Date().toISOString();

  /*
   * Report persistence model: combine reporter identity, GPS evidence, capture
   * metadata, moderation status, and normalized text into one reviewable document.
   */
  const reportData = {
    title: input.categoryName,
    description: input.description.trim(),
    location: input.locationText.trim() || `${input.barangay}, ${VALENCIA_CITY}`,
    category: input.categoryName,
    categoryId: input.categoryId,
    barangay: input.barangay.trim(),
    city: VALENCIA_CITY,
    reportedByUid: input.user.uid,
    reportedByName: `${input.user.firstName} ${input.user.lastName}`.trim(),
    reportedByEmail: input.user.email,
    status: 'Pending' as const,
    createdAt: now,
    imagePaths: [],
    images: imageUrls,
    coordinates: input.coordinates,
    imageTimestamp: input.photoTimestamp,
    imageLocation,
    imageMetadata: input.imageMetadata,
  };

  /* Firestore write: create a server-addressable report document and return its generated ID. */
  const docRef = await addDoc(collection(getDbInstance(), 'reports'), reportData);

  try {
    await notifyAdminsOfActivity({
      title: 'New environmental report',
      body: `${reportData.reportedByName} submitted "${reportData.title}".`,
      type: 'report',
      relatedId: docRef.id,
      actorUid: input.user.uid,
      actorName: reportData.reportedByName,
    });
  } catch {
    // Do not block report creation if admin notify fails.
  }

  return docRef.id;
}

/**
 * Purpose: Retrieves all reports submitted by one user.
 * How it works: 1) queries by reporter UID. 2) maps snapshots to typed reports. 3) sorts newest first.
 * Technologies Used: Firebase Firestore queries and TypeScript.
 * Why this implementation: UID filtering enforces user-scoped dashboards while client sorting handles stored ISO dates.
 */
export async function fetchUserReports(userId: string): Promise<EcoReport[]> {
  /* Firestore query: return only documents whose ownership field matches the active user. */
  const snapshot = await getDocs(
    query(collection(getDbInstance(), 'reports'), where('reportedByUid', '==', userId)),
  );

  return snapshot.docs
    .map((item) => ({
      id: item.id,
      ...(item.data() as Omit<EcoReport, 'id'>),
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Purpose: Loads one report with optional owner verification.
 * How it works: 1) reads by document ID. 2) handles missing data. 3) compares the reporter UID when supplied.
 * Technologies Used: Firebase Firestore.
 * Why this implementation: One helper centralizes the ownership guard used by view, edit, and delete workflows.
 */
export async function fetchReportById(reportId: string, userId?: string): Promise<EcoReport | null> {
  /* Firestore read: direct document lookup avoids a collection scan. */
  const snapshot = await getDoc(doc(getDbInstance(), 'reports', reportId));
  if (!snapshot.exists()) return null;

  const report = { id: snapshot.id, ...(snapshot.data() as Omit<EcoReport, 'id'>) };

  /* Authorization validation: hide reports that do not belong to the requesting user. */
  if (userId && report.reportedByUid !== userId) {
    return null;
  }

  return report;
}

/**
 * Purpose: Updates only the editable description of an owned report.
 * How it works: 1) verifies report ownership. 2) normalizes description text. 3) writes an update timestamp.
 * Technologies Used: Firebase Firestore.
 * Why this implementation: Restricting fields protects submitted evidence and moderation metadata from accidental edits.
 */
export async function updateReportDescription(
  reportId: string,
  userId: string,
  description: string,
): Promise<void> {
  const report = await fetchReportById(reportId, userId);
  if (!report) {
    throw new Error('Report not found or you do not have permission to edit it.');
  }

  /* Firestore write: change the permitted text field and record when the edit occurred. */
  await updateDoc(doc(getDbInstance(), 'reports', reportId), {
    description: description.trim(),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Purpose: Deletes a report owned by the active user.
 * How it works: 1) verifies existence and ownership. 2) removes the Firestore document.
 * Technologies Used: Firebase Firestore.
 * Why this implementation: Reusing the ownership lookup prevents unauthorized destructive operations.
 */
export async function deleteUserReport(reportId: string, userId: string): Promise<void> {
  const report = await fetchReportById(reportId, userId);
  if (!report) {
    throw new Error('Report not found or you do not have permission to delete it.');
  }

  /* Firestore delete: execute only after the ownership check succeeds. */
  await deleteDoc(doc(getDbInstance(), 'reports', reportId));
}
