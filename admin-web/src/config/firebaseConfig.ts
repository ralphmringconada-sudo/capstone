/*
 * Purpose: Defines the Firebase project connection values used by the admin portal.
 * How it works:
 * 1. Expo public environment variables provide deployment-specific values when configured.
 * 2. Existing project values act as development fallbacks.
 * Technologies Used: Expo environment variables and Firebase web configuration.
 * Why this implementation: Environment overrides support multiple deployments without changing consumers.
 */
export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyA24JSqDdVpXMTX_Immim4ojEjTTMT-BHo',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'ecobantay-18061.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'ecobantay-18061',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'ecobantay-18061',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '117741383587',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '1:117741383587:web:991f984fa7451cef3df416',
};
