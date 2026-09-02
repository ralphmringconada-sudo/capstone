import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCredential,
  signOut,
  deleteUser,
  GoogleAuthProvider,
  sendEmailVerification,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { deleteDoc, doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { Platform } from 'react-native';
import { getAuthInstance, getDbInstance } from '@/config/firebase';
import { firebaseConfig } from '@/config/firebaseConfig';
import type { AuthProvider, UserProfile } from '@/types/user';
import { withTimeout } from '@/utils/async';

const USERS_COLLECTION = 'users';
const REQUEST_TIMEOUT_MS = 20000;

/**
 * Purpose: Provides the shared authentication service used by this module.
 * How it works: 1) Requests the initialized Auth object. 2) Returns it to the caller.
 * Technologies Used: Firebase Authentication.
 * Why this implementation: A local accessor keeps every auth operation on the same configured instance.
 */
function auth() {
  return getAuthInstance();
}

/**
 * Purpose: Converts a selected birthday into the profile's human-readable storage format.
 * How it works: 1) Applies the US locale. 2) Includes the full month, day, and year.
 * Technologies Used: JavaScript Date internationalization.
 * Why this implementation: A stable display format keeps profile creation and rendering consistent.
 */
function formatBirthday(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Purpose: Derives first and last name fields from a Google display name.
 * How it works: 1) Handles missing names. 2) Splits normalized words. 3) Assigns the remainder as last name.
 * Technologies Used: TypeScript and JavaScript string processing.
 * Why this implementation: Google supplies one display name while EcoBantay stores separate profile fields.
 */
function splitDisplayName(displayName?: string | null) {
  if (!displayName?.trim()) {
    return { firstName: '', lastName: '' };
  }

  const parts = displayName.trim().split(/\s+/);
  const firstName = parts[0] ?? '';
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

/**
 * Purpose: Retrieves the application profile associated with a Firebase user.
 * How it works: 1) Builds the user document reference. 2) Reads Firestore. 3) Returns data or null.
 * Technologies Used: Firebase Firestore.
 * Why this implementation: Authentication identity and application-specific profile data remain separately managed.
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  /*
   * Firestore read: the Firebase UID is also the document ID, which gives a direct
   * lookup and avoids a collection query during authentication.
   */
  const snapshot = await getDoc(doc(getDbInstance(), USERS_COLLECTION, uid));
  if (!snapshot.exists()) return null;
  return snapshot.data() as UserProfile;
}

/**
 * Purpose: Persists a complete EcoBantay user profile.
 * How it works: prefers an authenticated REST write (explicit Bearer token) on native, else SDK setDoc.
 * Technologies Used: Firebase Auth ID tokens, Firestore REST API, Firebase Firestore SDK.
 * Why this implementation: On Expo/React Native the SDK sometimes writes before Auth is attached, causing false permission-denied.
 */
async function saveUserProfile(profile: UserProfile) {
  const currentUser = auth().currentUser;
  if (!currentUser || currentUser.uid !== profile.uid) {
    throw Object.assign(new Error('Not signed in while saving profile.'), {
      code: 'permission-denied',
    });
  }

  const token = await currentUser.getIdToken(true);
  const cleanProfile: UserProfile = {
    uid: profile.uid,
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    email: profile.email ?? '',
    contactNumber: profile.contactNumber ?? '',
    birthday: profile.birthday ?? '',
    authProvider: profile.authProvider,
    createdAt: profile.createdAt,
    ...(profile.updatedAt ? { updatedAt: profile.updatedAt } : {}),
  };

  // Native: send the ID token explicitly so Firestore rules always see request.auth.
  if (Platform.OS !== 'web') {
    await saveUserProfileWithIdToken(cleanProfile, token);
    return;
  }

  await setDoc(doc(getDbInstance(), USERS_COLLECTION, cleanProfile.uid), cleanProfile, { merge: true });
}

/** Converts a flat profile object into Firestore REST `fields` map. */
function toFirestoreRestFields(profile: UserProfile): Record<string, { stringValue: string }> {
  const fields: Record<string, { stringValue: string }> = {};
  (Object.keys(profile) as (keyof UserProfile)[]).forEach((key) => {
    const value = profile[key];
    if (typeof value === 'string') {
      fields[key] = { stringValue: value };
    }
  });
  return fields;
}

/**
 * Purpose: Writes users/{uid} using Firestore REST with Authorization: Bearer <idToken>.
 * How it works: PATCH the document so create and retry-update both succeed under the same rules.
 */
async function saveUserProfileWithIdToken(profile: UserProfile, idToken: string): Promise<void> {
  const projectId = firebaseConfig.projectId;
  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/users/${encodeURIComponent(profile.uid)}`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: toFirestoreRestFields(profile) }),
  });

  if (response.ok) return;

  const bodyText = await response.text();
  let message = `Profile save failed (${response.status}).`;
  try {
    const parsed = JSON.parse(bodyText) as { error?: { message?: string; status?: string } };
    if (parsed.error?.message) message = parsed.error.message;
  } catch {
    if (bodyText) message = bodyText.slice(0, 180);
  }

  if (response.status === 403 || /permission|PERMISSION_DENIED/i.test(message)) {
    throw Object.assign(new Error(message), { code: 'permission-denied' });
  }
  throw new Error(message);
}

/**
 * Purpose: Waits until Auth has a current user and a fresh ID token for Firestore rules.
 * How it works: waits for onAuthStateChanged for this UID, refreshes the token, then yields briefly.
 */
async function ensureAuthReadyForFirestore(user: User): Promise<void> {
  const authApi = auth();

  await new Promise<void>((resolve, reject) => {
    if (authApi.currentUser?.uid === user.uid) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('Timed out waiting for Auth session after signup.'));
    }, 10000);

    const unsubscribe = onAuthStateChanged(authApi, (nextUser) => {
      if (nextUser?.uid === user.uid) {
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      }
    });
  });

  if (typeof (authApi as { authStateReady?: () => Promise<void> }).authStateReady === 'function') {
    await (authApi as { authStateReady: () => Promise<void> }).authStateReady();
  }

  await user.getIdToken(true);
  await new Promise((resolve) => setTimeout(resolve, 500));
}

/** Removes all reports owned by the user before account deletion. */
async function deleteUserReports(userId: string) {
  const snapshot = await getDocs(
    query(collection(getDbInstance(), 'reports'), where('reportedByUid', '==', userId)),
  );
  await Promise.all(snapshot.docs.map((reportDoc) => deleteDoc(reportDoc.ref)));
}

/**
 * Purpose: Registers an email user and creates the corresponding application profile.
 * How it works: 1) Creates Firebase credentials. 2) builds profile data. 3) saves Firestore data. 4) rolls back on failure.
 * Technologies Used: Firebase Authentication, Firebase Firestore, TypeScript promises.
 * Why this implementation: Coordinated creation prevents an Auth account from remaining without required profile data.
 */
export async function registerWithEmail(input: {
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  password: string;
  birthday: Date;
}): Promise<UserProfile> {
  let createdUser: User | null = null;
  let profileSaved = false;

  try {
    /*
     * Authentication API call: apply a deadline so unavailable Firebase services
     * produce actionable feedback instead of leaving registration indefinitely pending.
     */
    const credential = await withTimeout(
      createUserWithEmailAndPassword(auth(), input.email.trim(), input.password),
      REQUEST_TIMEOUT_MS,
      'Could not reach Firebase Authentication. On your phone, try mobile data instead of Wi-Fi, then restart Expo with: npx expo start --clear',
    );

    createdUser = credential.user;

    // Ensure Firestore receives a fresh Auth token before the profile write (avoids hung/denied creates).
    await withTimeout(
      ensureAuthReadyForFirestore(credential.user),
      REQUEST_TIMEOUT_MS,
      'Could not refresh your sign-in token. Check your internet connection and try again.',
    );

    const profile: UserProfile = {
      uid: credential.user.uid,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim().toLowerCase(),
      contactNumber: input.contactNumber.trim(),
      birthday: formatBirthday(input.birthday),
      authProvider: 'email',
      createdAt: new Date().toISOString(),
    };

    /*
     * Firestore write: persist profile details only after Firebase Authentication
     * has issued a stable UID for use as the document key.
     */
    try {
      await withTimeout(
        saveUserProfile(profile),
        REQUEST_TIMEOUT_MS,
        'Timed out saving your profile to Firestore. Check internet, then try again.',
      );
    } catch (firstSaveError) {
      // One retry after a short pause — common after brand-new Auth sessions on mobile.
      await new Promise((resolve) => setTimeout(resolve, 800));
      await credential.user.getIdToken(true);
      try {
        await withTimeout(
          saveUserProfile(profile),
          REQUEST_TIMEOUT_MS,
          'Timed out saving your profile to Firestore. Check internet, then try again.',
        );
      } catch (secondSaveError) {
        throw mapServiceError(secondSaveError ?? firstSaveError);
      }
    }
    profileSaved = true;

    try {
      await withTimeout(
        sendEmailVerification(credential.user),
        REQUEST_TIMEOUT_MS,
        'Account was created, but the verification email could not be sent. Open Verify Email and tap Resend.',
      );
    } catch (verifyError) {
      // Keep the account — user can resend verification from the verify-email screen.
      console.warn('sendEmailVerification failed after signup:', verifyError);
    }

    return profile;
  } catch (error) {
    /*
     * Error handling: roll back the newly created Auth identity only when the
     * Firestore profile was not saved, so Auth and profile stay consistent.
     */
    if (createdUser && !profileSaved) {
      try {
        await deleteUser(createdUser);
      } catch {
        // Ignore cleanup errors if the session is already invalid.
      }
    }

    throw mapServiceError(error);
  }
}

/**
 * Purpose: Authenticates an email user and loads their EcoBantay profile.
 * How it works: 1) Normalizes email. 2) signs in with Firebase. 3) reads Firestore. 4) rejects incomplete accounts.
 * Technologies Used: Firebase Authentication and Firebase Firestore.
 * Why this implementation: The app requires both valid credentials and profile data before starting a session.
 */
/** Blocks administrator Firebase accounts from establishing a mobile citizen session. */
export async function assertNotAdminAccount(uid: string) {
  const adminSnap = await getDoc(doc(getDbInstance(), 'admins', uid));
  if (adminSnap.exists()) {
    await signOut(auth());
    throw new Error('Admin accounts must use the EcoBantay Admin website, not the mobile app.');
  }
}

export async function loginWithEmail(email: string, password: string): Promise<UserProfile> {
  const trimmedEmail = email.trim().toLowerCase();

  try {
    /*
     * Authentication API call: sign in directly because Firebase Email Enumeration
     * Protection intentionally hides whether a submitted address already exists.
     */
    const credential = await signInWithEmailAndPassword(auth(), trimmedEmail, password);
    await assertNotAdminAccount(credential.user.uid);

    if (!credential.user.emailVerified) {
      try {
        await sendEmailVerification(credential.user);
      } catch {
        // Ignore resend failures; the main message still asks the user to verify.
      }
      await signOut(auth());
      throw new Error(
        'Please verify your email before signing in. We sent a verification link to your inbox.',
      );
    }

    const profile = await getUserProfile(credential.user.uid);

    /*
     * Validation: immediately end sessions that have no corresponding Firestore
     * profile because the rest of the application depends on that profile.
     */
    if (!profile) {
      await signOut(auth());
      throw new Error(
        'Your login works, but your profile was not found in the database. Please sign up again or contact support.',
      );
    }

    return profile;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message.includes('profile was not found in the database') ||
        error.message.includes('Admin accounts must use') ||
        error.message.includes('verify your email'))
    ) {
      throw error;
    }
    throw mapServiceError(error);
  }
}

/**
 * Purpose: Resends the Firebase verification email for an unverified password account.
 * How it works: signs in briefly, sends verification when needed, then signs out.
 */
export async function resendEmailVerification(email: string, password: string): Promise<void> {
  const trimmedEmail = email.trim().toLowerCase();
  const credential = await signInWithEmailAndPassword(auth(), trimmedEmail, password);
  try {
    await assertNotAdminAccount(credential.user.uid);
    if (credential.user.emailVerified) {
      await signOut(auth());
      throw new Error('This email is already verified. You can sign in now.');
    }
    await sendEmailVerification(credential.user);
  } finally {
    await signOut(auth()).catch(() => undefined);
  }
}

/**
 * Purpose: Confirms the inbox link was opened and activates a mobile session.
 * How it works: signs in, reloads Auth user, keeps the session only when emailVerified is true.
 */
export async function checkEmailVerifiedAndSignIn(
  email: string,
  password: string,
): Promise<boolean> {
  const trimmedEmail = email.trim().toLowerCase();
  const credential = await signInWithEmailAndPassword(auth(), trimmedEmail, password);
  await assertNotAdminAccount(credential.user.uid);
  await credential.user.reload();
  if (!credential.user.emailVerified) {
    await signOut(auth());
    return false;
  }
  return true;
}

/**
 * Purpose: Authenticates an existing account with a Google ID token.
 * How it works: 1) Creates a Google credential. 2) signs in. 3) loads the profile. 4) verifies provider ownership.
 * Technologies Used: Google OAuth, Firebase Authentication, Firebase Firestore.
 * Why this implementation: Provider verification prevents users from entering an email-created account through Google.
 */
export async function loginWithGoogle(idToken: string): Promise<UserProfile> {
  const credential = GoogleAuthProvider.credential(idToken);

  try {
    /* Authentication API call: exchange the Google token for a Firebase session. */
    const authCredential = await signInWithCredential(auth(), credential);
    await assertNotAdminAccount(authCredential.user.uid);
    const profile = await getUserProfile(authCredential.user.uid);

    /* Validation: Google login is only allowed for an already registered application profile. */
    if (!profile) {
      await signOut(auth());
      throw new Error('Account does not exist.');
    }

    if (profile.authProvider !== 'google') {
      await signOut(auth());
      throw new Error('This account was not registered with Google. Please sign in with email and password.');
    }

    return profile;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message.startsWith('Account does not exist') ||
        error.message.startsWith('This account was not registered') ||
        error.message.includes('Admin accounts must use'))
    ) {
      throw error;
    }
    throw mapServiceError(error);
  }
}

/**
 * Purpose: Registers a new Google-authenticated user in EcoBantay.
 * How it works: 1) Exchanges the ID token. 2) checks for an existing profile. 3) maps provider data. 4) saves Firestore.
 * Technologies Used: Google OAuth, Firebase Authentication, Firebase Firestore.
 * Why this implementation: It uses trusted provider identity while still creating fields required by the application.
 */
export async function registerWithGoogle(idToken: string): Promise<UserProfile> {
  const credential = GoogleAuthProvider.credential(idToken);

  try {
    const authCredential = await signInWithCredential(auth(), credential);
    await withTimeout(
      ensureAuthReadyForFirestore(authCredential.user),
      REQUEST_TIMEOUT_MS,
      'Could not refresh your Google sign-in token. Check your internet connection and try again.',
    );

    /* Firestore read: prevent registration from replacing an existing application profile. */
    const existingProfile = await getUserProfile(authCredential.user.uid);

    if (existingProfile) {
      await signOut(auth());
      throw new Error('An account with this Google email already exists. Please sign in instead.');
    }

    const { firstName, lastName } = splitDisplayName(authCredential.user.displayName);
    const profile: UserProfile = {
      uid: authCredential.user.uid,
      firstName,
      lastName,
      email: (authCredential.user.email ?? '').toLowerCase(),
      contactNumber: authCredential.user.phoneNumber ?? '',
      birthday: '',
      authProvider: 'google',
      createdAt: new Date().toISOString(),
    };

    /* Firestore write: persist the provider-derived profile after duplicate validation. */
    try {
      await withTimeout(
        saveUserProfile(profile),
        REQUEST_TIMEOUT_MS,
        'Timed out saving your profile to Firestore. Check internet, then try again.',
      );
    } catch (firstSaveError) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await authCredential.user.getIdToken(true);
      try {
        await withTimeout(
          saveUserProfile(profile),
          REQUEST_TIMEOUT_MS,
          'Timed out saving your profile to Firestore. Check internet, then try again.',
        );
      } catch (secondSaveError) {
        throw mapServiceError(secondSaveError ?? firstSaveError);
      }
    }
    return profile;
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith('An account with this Google email')) {
      throw error;
    }
    throw mapServiceError(error);
  }
}

/**
 * Purpose: Ends the active authentication session.
 * How it works: 1) Gets shared Auth state. 2) asks Firebase to sign out.
 * Technologies Used: Firebase Authentication.
 * Why this implementation: Firebase handles token cleanup and notifies the application's auth observer.
 */
export async function logoutUser() {
  await signOut(auth());
}

/**
 * Purpose: Starts Firebase's email password-recovery flow.
 * How it works: 1) Normalizes the address. 2) sends the reset request. 3) maps failures.
 * Technologies Used: Firebase Authentication.
 * Why this implementation: Firebase provides a secure, tokenized reset process without exposing passwords to the app.
 */
export async function sendForgotPasswordEmail(email: string) {
  const trimmedEmail = email.trim().toLowerCase();
  try {
    const response = await fetch(
      'https://us-central1-ecobantay-18061.cloudfunctions.net/requestPasswordReset',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail }),
      },
    );
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      throw new Error(data.error || 'Failed to send reset email.');
    }
  } catch (error) {
    throw mapServiceError(error);
  }
}

/**
 * Purpose: Updates editable profile fields for the signed-in user.
 * How it works: 1) validates session and profile. 2) normalizes input. 3) writes selected Firestore fields.
 * Technologies Used: Firebase Authentication and Firebase Firestore.
 * Why this implementation: Ownership comes from the active UID and only approved fields are modified.
 */
export async function updateUserProfile(input: {
  firstName: string;
  lastName: string;
  contactNumber: string;
  birthday: string;
}): Promise<UserProfile> {
  const currentUser = auth().currentUser;
  /* Validation: profile changes require an authenticated owner. */
  if (!currentUser) {
    throw new Error('You must be signed in to update your profile.');
  }

  const existing = await getUserProfile(currentUser.uid);
  if (!existing) {
    throw new Error('Account does not exist.');
  }

  const profile: UserProfile = {
    ...existing,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    contactNumber: input.contactNumber.trim(),
    birthday: input.birthday.trim(),
  };

  await withTimeout(
    updateDoc(doc(getDbInstance(), USERS_COLLECTION, currentUser.uid), {
      firstName: profile.firstName,
      lastName: profile.lastName,
      contactNumber: profile.contactNumber,
      birthday: profile.birthday,
      updatedAt: new Date().toISOString(),
    }),
    REQUEST_TIMEOUT_MS,
    'Could not save profile changes. Check your internet connection and Firestore rules.',
  );

  return profile;
}

/**
 * Purpose: Securely changes the current email user's password.
 * How it works: 1) validates the session/provider. 2) reauthenticates with the current password. 3) updates Firebase.
 * Technologies Used: Firebase Authentication.
 * Why this implementation: Reauthentication proves recent account ownership before a sensitive credential change.
 */
export async function changeUserPassword(currentPassword: string, newPassword: string) {
  const currentUser = auth().currentUser;
  if (!currentUser || !currentUser.email) {
    throw new Error('You must be signed in to change your password.');
  }

  const providers = currentUser.providerData.map((provider) => provider.providerId);
  if (!providers.includes('password')) {
    throw new Error('Google accounts cannot change password here. Manage it in your Google account.');
  }

  if (newPassword === currentPassword) {
    throw new Error('New password must be different from your current password.');
  }

  try {
    const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
    await withTimeout(
      reauthenticateWithCredential(currentUser, credential),
      REQUEST_TIMEOUT_MS,
      'Could not verify your current password. Check your connection and try again.',
    );
    await withTimeout(
      updatePassword(currentUser, newPassword),
      REQUEST_TIMEOUT_MS,
      'Could not update your password. Please try again.',
    );
  } catch (error) {
    throw mapServiceError(error);
  }
}

/**
 * Purpose: Permanently removes the signed-in user's profile and authentication identity.
 * How it works: 1) validates session. 2) reauthenticates email users. 3) deletes Firestore data. 4) deletes Auth identity.
 * Technologies Used: Firebase Authentication and Firebase Firestore.
 * Why this implementation: Sensitive deletion is verified first and removes both application and identity records.
 */
export async function deleteUserAccount(currentPassword?: string) {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    throw new Error('You must be signed in to delete your account.');
  }

  try {
    /*
     * Authentication validation: password accounts must prove recent ownership;
     * Google sessions rely on their provider-managed recent authentication.
     */
    const providers = currentUser.providerData.map((provider) => provider.providerId);
    if (providers.includes('password') && currentUser.email) {
      if (!currentPassword) {
        throw new Error('Enter your password to confirm account deletion.');
      }
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
    }

    await withTimeout(
      deleteUserReports(currentUser.uid),
      REQUEST_TIMEOUT_MS,
      'Could not delete your reports. Check your connection and try again.',
    );
    await withTimeout(
      deleteDoc(doc(getDbInstance(), USERS_COLLECTION, currentUser.uid)),
      REQUEST_TIMEOUT_MS,
      'Could not delete your profile from the database.',
    );
    await withTimeout(
      deleteUser(currentUser),
      REQUEST_TIMEOUT_MS,
      'Could not delete your login account. Try signing in again, then retry.',
    );
  } catch (error) {
    throw mapServiceError(error);
  }
}

/**
 * Purpose: Converts cross-service failures into safe, actionable messages.
 * How it works: 1) checks Firestore/network cases. 2) preserves timeout guidance. 3) delegates Auth codes.
 * Technologies Used: Firebase error codes and TypeScript error handling.
 * Why this implementation: Central mapping keeps technical details out of screens and gives users consistent feedback.
 */
function mapServiceError(error: unknown): Error {
  const code = (error as { code?: string })?.code;

  if (code === 'permission-denied') {
    const detail =
      error instanceof Error && error.message && !error.message.includes('Database permission denied')
        ? ` (${error.message})`
        : '';
    return new Error(
      `Database permission denied while saving your profile${detail}. Reload Expo with npx expo start --clear and try a new email.`,
    );
  }

  if (code === 'unavailable' || code === 'network-request-failed') {
    return new Error('Network error. Check your internet connection and try again.');
  }

  if (error instanceof Error && error.message.includes('timed out')) {
    return error;
  }

  return mapFirebaseAuthError(error);
}

/**
 * Purpose: Translates Firebase Authentication error codes for the user interface.
 * How it works: 1) extracts the code. 2) maps known cases. 3) supplies a safe fallback.
 * Technologies Used: Firebase Authentication error codes.
 * Why this implementation: A controlled switch avoids exposing implementation-specific or sensitive server messages.
 */
function mapFirebaseAuthError(error: unknown): Error {
  const code = (error as { code?: string })?.code;
  const rawMessage = error instanceof Error ? error.message : '';

  switch (code) {
    case 'auth/user-not-found':
      return new Error('Account does not exist.');
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return new Error('Incorrect email or password.');
    case 'auth/requires-recent-login':
      return new Error('Please log out and log in again before doing this.');
    case 'auth/email-already-in-use':
      return new Error(
        'An account with this email already exists. Try signing in, or use Verify Email if you have not activated it yet.',
      );
    case 'auth/invalid-email':
      return new Error('Please enter a valid email address.');
    case 'auth/too-many-requests':
      return new Error('Too many attempts. Please try again later.');
    case 'auth/weak-password':
      return new Error('Password is too weak. Please choose a stronger password.');
    case 'auth/operation-not-allowed':
      return new Error(
        'Email/password sign-up is disabled in Firebase. Enable Email/Password under Authentication → Sign-in method.',
      );
    case 'auth/network-request-failed':
      return new Error('Network error. Check your internet connection and try again.');
    default:
      if (rawMessage && !rawMessage.startsWith('Firebase:')) {
        return new Error(rawMessage);
      }
      if (rawMessage) {
        return new Error(rawMessage.replace(/^Firebase:\s*/i, '').replace(/\s*\(.*\)\s*$/, '').trim() || 'Something went wrong. Please try again.');
      }
      return new Error('Something went wrong. Please try again.');
  }
}

/**
 * Purpose: Identifies the EcoBantay authentication provider for a Firebase user.
 * How it works: 1) collects provider IDs. 2) checks Google and password providers. 3) returns null if unsupported.
 * Technologies Used: Firebase Authentication user metadata.
 * Why this implementation: Stored provider labels drive provider-specific security and interface behavior.
 */
export function toAuthProvider(user: User): AuthProvider | null {
  const providerIds = user.providerData.map((provider) => provider.providerId);
  if (providerIds.includes('google.com')) return 'google';
  if (providerIds.includes('password')) return 'email';
  return null;
}
