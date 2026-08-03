import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { firebaseConfig } from '@/config/firebaseConfig';

/*
 * Purpose: Initializes the shared Firebase services used by the admin portal.
 * How it works:
 * 1. An existing Firebase app is reused during web development reloads.
 * 2. A new app is initialized only when no prior instance exists.
 * 3. Authentication, Firestore, and Storage clients are exported from the same app instance.
 * Technologies Used: Firebase App, Authentication, Firestore, and Storage.
 * Why this implementation: Singleton initialization prevents duplicate-app errors and keeps services aligned.
 */
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
