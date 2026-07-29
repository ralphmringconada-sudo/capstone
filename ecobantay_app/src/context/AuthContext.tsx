import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  FIREBASE_SETUP_MESSAGE,
  getAuthInstance,
  isFirebaseConfigured,
} from '@/config/firebase';
import {
  getUserProfile,
  loginWithEmail,
  loginWithGoogle,
  logoutUser,
  registerWithEmail,
  registerWithGoogle,
} from '@/services/authService';
import type { UserProfile } from '@/types/user';

type AuthContextValue = {
  user: UserProfile | null;
  isLoading: boolean;
  isFirebaseConfigured: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    firstName: string;
    lastName: string;
    email: string;
    contactNumber: string;
    password: string;
    birthday: Date;
  }) => Promise<void>;
  loginGoogle: (idToken: string) => Promise<void>;
  registerGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<UserProfile | null>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Purpose: Guards authentication actions against incomplete Firebase setup.
 * How it works: 1) checks centralized configuration readiness. 2) throws the shared setup message when invalid.
 * Technologies Used: Firebase configuration and TypeScript error handling.
 * Why this implementation: A common guard keeps every auth action consistent and prevents invalid SDK requests.
 */
function ensureFirebaseConfigured() {
  if (!isFirebaseConfigured()) {
    throw new Error(FIREBASE_SETUP_MESSAGE);
  }
}

/**
 * Purpose: Supplies application-wide authentication state and actions.
 * How it works: 1) observes Firebase sessions. 2) loads Firestore profiles. 3) exposes memoized auth operations.
 * Technologies Used: React Context, React hooks, Firebase Authentication, Firebase Firestore.
 * Why this implementation: One provider keeps navigation and screens synchronized with the same user lifecycle.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  /*
   * Authentication workflow state: user stores the Firestore-backed profile,
   * while isLoading prevents routing before Firebase restores a persisted session.
   */
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(isFirebaseConfigured());

  /*
   * Authentication lifecycle: subscribe once to Firebase session changes, resolve
   * the matching Firestore profile, and always release the loading gate afterward.
   */
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setIsLoading(false);
      return;
    }

    /* Firebase Authentication observer: reacts to login, logout, and restored native sessions. */
    const unsubscribe = onAuthStateChanged(getAuthInstance(), async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      /*
       * Firestore read and error handling: an authenticated identity is accepted
       * only when its required application profile can also be loaded.
       */
      try {
        const profile = await getUserProfile(firebaseUser.uid);
        setUser(profile);
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  /**
   * Purpose: Signs in with email credentials and updates provider state.
   * How it works: 1) validates setup. 2) calls the auth service. 3) stores the returned profile.
   * Technologies Used: React useCallback, Firebase Authentication, Firebase Firestore.
   * Why this implementation: Updating context immediately gives all consumers the same authenticated profile.
   */
  const login = useCallback(async (email: string, password: string) => {
    ensureFirebaseConfigured();
    const profile = await loginWithEmail(email, password);
    setUser(profile);
  }, []);

  /**
   * Purpose: Registers an email account and publishes its profile to the application.
   * How it works: 1) validates setup. 2) delegates account creation. 3) stores the resulting profile.
   * Technologies Used: React useCallback, Firebase Authentication, Firebase Firestore.
   * Why this implementation: The provider presents one stable registration API to every screen.
   */
  const register = useCallback(
    async (input: {
      firstName: string;
      lastName: string;
      email: string;
      contactNumber: string;
      password: string;
      birthday: Date;
    }) => {
      ensureFirebaseConfigured();
      const profile = await registerWithEmail(input);
      setUser(profile);
    },
    [],
  );

  /**
   * Purpose: Completes Google login using an OAuth ID token.
   * How it works: 1) validates setup. 2) exchanges the token through the service. 3) updates profile state.
   * Technologies Used: React useCallback, Google OAuth, Firebase Authentication.
   * Why this implementation: OAuth handling remains centralized while screens manage only user interaction.
   */
  const loginGoogle = useCallback(async (idToken: string) => {
    ensureFirebaseConfigured();
    const profile = await loginWithGoogle(idToken);
    setUser(profile);
  }, []);

  /**
   * Purpose: Completes Google registration and publishes the new profile.
   * How it works: 1) validates setup. 2) delegates provider registration. 3) stores the profile.
   * Technologies Used: React useCallback, Google OAuth, Firebase Authentication, Firebase Firestore.
   * Why this implementation: It provides the same context-level result as email registration.
   */
  const registerGoogle = useCallback(async (idToken: string) => {
    ensureFirebaseConfigured();
    const profile = await registerWithGoogle(idToken);
    setUser(profile);
  }, []);

  /**
   * Purpose: Ends the current session and clears application user state.
   * How it works: 1) handles unconfigured development state. 2) signs out through Firebase. 3) clears profile state.
   * Technologies Used: React useCallback and Firebase Authentication.
   * Why this implementation: Explicit local cleanup keeps the interface responsive to completed logout.
   */
  const logout = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      setUser(null);
      return;
    }
    await logoutUser();
    setUser(null);
  }, []);

  /**
   * Purpose: Reloads the current user's profile after a Firestore update.
   * How it works: 1) checks the active Firebase user. 2) reads the profile. 3) replaces context state.
   * Technologies Used: React useCallback, Firebase Authentication, Firebase Firestore.
   * Why this implementation: Screens receive persisted profile values without restarting the session.
   */
  const refreshUser = useCallback(async () => {
    const current = getAuthInstance().currentUser;
    if (!current) {
      setUser(null);
      return null;
    }
    const profile = await getUserProfile(current.uid);
    setUser(profile);
    return profile;
  }, []);

  /*
   * Consequential state composition: memoize the public context contract so
   * consumers rerender only when user data, loading state, or actions change.
   */
  const value = useMemo(
    () => ({
      user,
      isLoading,
      isFirebaseConfigured: isFirebaseConfigured(),
      login,
      register,
      loginGoogle,
      registerGoogle,
      logout,
      refreshUser,
    }),
    [user, isLoading, login, register, loginGoogle, registerGoogle, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Purpose: Gives components safe access to the authentication context.
 * How it works: 1) reads the nearest context. 2) validates provider presence. 3) returns the typed contract.
 * Technologies Used: React Context and React useContext.
 * Why this implementation: The explicit guard exposes setup mistakes immediately during development.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
