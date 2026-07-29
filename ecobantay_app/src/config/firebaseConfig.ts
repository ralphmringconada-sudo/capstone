// EcoBantay Firebase web app config (Firebase Console → Project settings → Your apps)
export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyA24JSqDdVpXMTX_Immim4ojEjTTMT-BHo',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'ecobantay-18061.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'ecobantay-18061',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'ecobantay-18061',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '117741383587',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '1:117741383587:web:991f984fa7451cef3df416',
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? 'G-M5RD56J1RZ',
};
