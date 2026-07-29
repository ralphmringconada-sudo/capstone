/**
 * Firebase Administration Module
 *
 * Purpose:
 * Establishes the trusted server-side Firebase connection shared by EcoBantay
 * backend modules and exports ready-to-use Authentication and Firestore clients.
 *
 * How it works:
 * 1. Loads backend configuration values from the environment.
 * 2. Resolves the service-account file relative to this module.
 * 3. Verifies and parses the credential file before use.
 * 4. Initializes one Firebase Admin application for the current process.
 * 5. Exposes common Auth and Firestore service instances.
 *
 * Technologies Used:
 * Firebase Admin SDK, dotenv, Node.js File System API, Node.js Path API,
 * and Node.js URL API.
 *
 * Why this implementation:
 * Centralizing privileged Firebase initialization prevents duplicate app
 * instances and gives every route one consistent, server-authorized data layer.
 */
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Converts the ES module URL into a directory path for reliable credential lookup.
const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = resolve(
  __dirname,
  '..',
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json',
);

// Guards initialization because Firebase Admin permits only one default app per process.
if (!admin.apps.length) {
  // Fails during startup with an actionable message instead of failing on a later request.
  if (!existsSync(serviceAccountPath)) {
    throw new Error(
      `Missing Firebase service account file at ${serviceAccountPath}. Download it from Firebase Console and save as serviceAccountKey.json.`,
    );
  }

  // Reads and converts the service-account JSON into the credential object Firebase expects.
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

  // Authenticates this backend as a trusted server through the service-account certificate.
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Exposes shared Firebase Auth and Firestore clients to backend modules.
export const auth = admin.auth();
export const db = admin.firestore();
