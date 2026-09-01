import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { getAdminProfile, resolveAdminLoginEmail, upsertAdminUsernameMapping } from '@/services/adminDataService';
import type { AdminProfile } from '@/types/admin';

type AdminAuthContextValue = {
  admin: AdminProfile | null;
  isLoading: boolean;
  isSuperAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAdmin: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

/**
 * Purpose: Provides verified administrator identity and session actions to the application.
 * How it works:
 * 1. Firebase Authentication reports whether a user session exists.
 * 2. Firestore supplies the corresponding administrator profile and role.
 * 3. Memoized login, logout, refresh, and role values are exposed through React Context.
 * Technologies Used: React Context, React hooks, Firebase Authentication, and Cloud Firestore.
 * Why this implementation: Combining identity with the admin document prevents ordinary app users from receiving admin access.
 */
export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  /*
   * The profile controls authorization-aware UI, while isLoading prevents route decisions
   * before Firebase has restored or rejected a persisted browser session.
   */
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Purpose: Refreshes the administrator document associated with the active auth user.
   * How it works:
   * 1. The current Firebase user is checked before data access.
   * 2. The matching Firestore admin document is loaded and stored in provider state.
   * Technologies Used: React useCallback, Firebase Authentication, and Cloud Firestore.
   * Why this implementation: A targeted refresh keeps profile edits current without rebuilding the session.
   */
  const refreshAdmin = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setAdmin(null);
      return;
    }

    // Read the authorization profile using the immutable Firebase Authentication UID.
    const profile = await getAdminProfile(currentUser.uid);
    setAdmin(profile);
  }, []);

  useEffect(() => {
    /*
     * Subscribe once to Firebase Authentication so page reloads and external sign-outs
     * are reflected in the same provider state used by route protection.
     */
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAdmin(null);
        setIsLoading(false);
        return;
      }

      // Resolve the Firestore role document before treating the session as administrative.
      // Citizen (users) accounts are signed out so they cannot stay on the admin portal.
      try {
        const profile = await getAdminProfile(user.uid);
        if (!profile || profile.status !== 'active') {
          await signOut(auth);
          setAdmin(null);
        } else {
          setAdmin(profile);
        }
      } catch {
        try {
          await signOut(auth);
        } catch {
          // Ignore sign-out failures during unauthorized session cleanup.
        }
        setAdmin(null);
      } finally {
        setIsLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  /**
   * Purpose: Authenticates credentials and verifies that the account may use the admin portal.
   * How it works:
   * 1. Firebase Authentication validates the submitted email and password.
   * 2. Firestore is queried for the user's administrator profile.
   * 3. Missing or inactive profiles are signed out before an explanatory error is raised.
   * Technologies Used: React useCallback, Firebase Authentication, and Cloud Firestore.
   * Why this implementation: Authentication alone proves identity; the profile and status checks establish authorization.
   */
  const login = useCallback(async (emailOrUsername: string, password: string) => {
    try {
      // Username logins resolve to the Firebase Auth email stored for that admin.
      const email = await resolveAdminLoginEmail(emailOrUsername);
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const profile = await getAdminProfile(credential.user.uid);

      // Reject valid Firebase accounts that are not represented in the admins collection.
      if (!profile) {
        await signOut(auth);
        throw new Error('This account is not authorized for admin access.');
      }

      // Enforce administrative account status before publishing the session to consumers.
      if (profile.status !== 'active') {
        await signOut(auth);
        throw new Error('This admin account is inactive.');
      }

      setAdmin(profile);

      // Keep username login working for older admin accounts created before mappings existed.
      if (profile.username && profile.email) {
        void upsertAdminUsernameMapping({
          username: profile.username,
          email: profile.email,
          uid: profile.uid,
        }).catch(() => undefined);
      }
    // Convert Firestore rule failures into an actionable message while preserving other errors.
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code === 'permission-denied') {
        throw new Error(
          'Missing or insufficient permissions. Publish Firestore rules from EcoBantay/firestore.rules, then try again.',
        );
      }
      throw error;
    }
  }, []);

  /**
   * Purpose: Terminates the current administrator session.
   * How it works:
   * 1. Firebase Authentication invalidates the local authenticated state.
   * 2. The cached administrator profile is cleared immediately.
   * Technologies Used: React useCallback and Firebase Authentication.
   * Why this implementation: Clearing both identity sources prevents stale admin information after logout.
   */
  const logout = useCallback(async () => {
    await signOut(auth);
    setAdmin(null);
  }, []);

  const value = useMemo(
    () => ({
      admin,
      isLoading,
      isSuperAdmin: admin?.role === 'super_admin',
      login,
      logout,
      refreshAdmin,
    }),
    [admin, isLoading, login, logout, refreshAdmin],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

/**
 * Purpose: Gives components typed access to the shared administrator session.
 * How it works:
 * 1. React reads the nearest AdminAuthContext value.
 * 2. A descriptive error is thrown when the hook is used outside its provider.
 * Technologies Used: React Context and a custom React hook.
 * Why this implementation: A dedicated hook centralizes provider validation and simplifies consumers.
 */
export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider');
  }
  return context;
}
