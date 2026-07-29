import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { initializeAuth, getAuth, type Auth } from 'firebase/auth';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { firebaseConfig } from '@/config/firebaseConfig';

export const FIREBASE_SETUP_MESSAGE =
  'Firebase is not configured. Copy .env.example to .env, add your Firebase credentials, then restart Expo with: npx expo start --clear';

/**
 * Purpose: Detects configuration values that are absent or still contain template placeholders.
 * How it works: 1) normalizes the value. 2) checks known placeholder patterns. 3) returns the validation result.
 * Technologies Used: TypeScript and environment-based Firebase configuration.
 * Why this implementation: It prevents Firebase initialization with sample credentials and provides earlier feedback.
 */
function isPlaceholderValue(value: string | undefined): boolean {
  if (!value) return true;

  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith('your_') ||
    normalized.startsWith('your-') ||
    normalized.includes('your_project') ||
    normalized.includes('your-project') ||
    normalized.includes('...') ||
    normalized === '123456789'
  );
}

/**
 * Purpose: Validates that all required Firebase client settings are configured.
 * How it works: 1) collects required fields. 2) verifies each is a nonempty string. 3) rejects placeholders.
 * Technologies Used: Firebase configuration and TypeScript.
 * Why this implementation: A single readiness check supports predictable startup and clear setup messaging.
 */
export function isFirebaseConfigured(): boolean {
  const required = {
    apiKey: firebaseConfig.apiKey,
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket,
    messagingSenderId: firebaseConfig.messagingSenderId,
    appId: firebaseConfig.appId,
  };

  return Object.values(required).every(
    (value) => typeof value === 'string' && value.length > 0 && !isPlaceholderValue(value),
  );
}

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;

/**
 * Purpose: Creates Firebase Authentication with persistence suited to the running platform.
 * How it works: 1) uses standard Auth on web. 2) initializes AsyncStorage persistence on native. 3) reuses Auth if needed.
 * Technologies Used: Firebase Authentication, React Native Platform, AsyncStorage.
 * Why this implementation: Native sessions survive app restarts while web retains Firebase's standard behavior.
 */
function createAuthInstance(firebaseApp: FirebaseApp): Auth {
  if (Platform.OS === 'web') {
    return getAuth(firebaseApp);
  }

  try {
    const { getReactNativePersistence } = require('firebase/auth') as {
      getReactNativePersistence: (storage: typeof AsyncStorage) => unknown;
    };

    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    // Hot reload may re-run init; reuse the existing Auth instance with persistence.
    if ((error as { code?: string }).code === 'auth/already-initialized') {
      return getAuth(firebaseApp);
    }
    throw error;
  }
}

/**
 * Purpose: Lazily initializes the Firebase app and shared service instances.
 * How it works: 1) validates config. 2) creates or reuses App/Auth. 3) initializes Firestore and Storage. 4) caches all.
 * Technologies Used: Firebase App, Authentication, Firestore, Storage, React Native Platform.
 * Why this implementation: Lazy singletons avoid duplicate-app errors and defer setup until a service is required.
 */
function initializeFirebase() {
  /* Configuration validation: fail before any Firebase SDK call when credentials are incomplete. */
  if (!isFirebaseConfigured()) {
    throw new Error(FIREBASE_SETUP_MESSAGE);
  }

  /* Firebase App initialization: reuse an SDK-created app during hot reload when available. */
  if (!appInstance) {
    appInstance = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }

  if (!authInstance) {
    authInstance = createAuthInstance(appInstance);
  }

  /*
   * Firestore initialization: native clients enable transport auto-detection for
   * mobile networks while web uses the standard browser Firestore instance.
   */
  if (!dbInstance) {
    dbInstance =
      Platform.OS === 'web'
        ? getFirestore(appInstance)
        : initializeFirestore(appInstance, {
            // Select long polling only on networks that cannot use the faster default transport.
            experimentalAutoDetectLongPolling: true,
          });
  }

  if (!storageInstance) {
    storageInstance = getStorage(appInstance);
  }

  return { app: appInstance, auth: authInstance, db: dbInstance, storage: storageInstance };
}

/**
 * Purpose: Exposes the initialized Firebase application singleton.
 * How it works: 1) runs lazy initialization. 2) returns the cached App.
 * Technologies Used: Firebase App SDK.
 * Why this implementation: Callers share one app without managing initialization order.
 */
export function getFirebaseApp(): FirebaseApp {
  return initializeFirebase().app;
}

/**
 * Purpose: Exposes the initialized Firebase Authentication singleton.
 * How it works: 1) runs lazy initialization. 2) returns the cached Auth service.
 * Technologies Used: Firebase Authentication.
 * Why this implementation: Shared Auth state keeps session observers and service calls synchronized.
 */
export function getAuthInstance(): Auth {
  return initializeFirebase().auth;
}

/**
 * Purpose: Exposes the initialized Firestore singleton.
 * How it works: 1) runs lazy initialization. 2) returns the cached database service.
 * Technologies Used: Firebase Firestore.
 * Why this implementation: One database instance preserves platform transport configuration.
 */
export function getDbInstance(): Firestore {
  return initializeFirebase().db;
}

/**
 * Purpose: Exposes the initialized Firebase Storage singleton.
 * How it works: 1) runs lazy initialization. 2) returns the cached Storage service.
 * Technologies Used: Firebase Storage.
 * Why this implementation: Upload and download operations consistently target the configured project bucket.
 */
export function getStorageInstance(): FirebaseStorage {
  return initializeFirebase().storage;
}
