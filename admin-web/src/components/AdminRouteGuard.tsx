import { useEffect, useRef } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useAdminAuth } from '@/context/AdminAuthContext';

const PUBLIC_ROUTES = ['index'];
const PROTECTED_ROUTES = [
  'dashboard',
  'reports',
  'report-details',
  'users',
  'events',
  'export',
  'settings',
];

/**
 * Purpose: Enforces the authentication boundary between public and protected admin routes.
 * How it works:
 * 1. The current route segment and admin-loading state are observed.
 * 2. Unauthenticated visitors are redirected away from protected routes.
 * 3. Authenticated administrators landing on login after entering the app are signed out
 *    (covers browser Back from dashboard to login for security).
 * 4. Fresh sessions that still open on login are sent to the dashboard.
 * Technologies Used: React effects, Expo Router, and the admin authentication context.
 * Why this implementation: A layout-level guard applies one access policy to the entire route tree.
 */
export function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const { admin, isLoading, logout } = useAdminAuth();
  const segments = useSegments();
  const router = useRouter();
  // Once an admin reaches a protected page, returning to login via Back forces re-auth.
  const enteredProtectedRef = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    const currentRoute = segments[0] ?? 'index';
    const isPublic = PUBLIC_ROUTES.includes(currentRoute);
    const isProtected = PROTECTED_ROUTES.includes(currentRoute);

    if (!admin && isProtected) {
      enteredProtectedRef.current = false;
      router.replace('/');
      return;
    }

    if (admin && isProtected) {
      enteredProtectedRef.current = true;
      return;
    }

    if (admin && isPublic) {
      if (enteredProtectedRef.current) {
        enteredProtectedRef.current = false;
        void logout().then(() => {
          router.replace('/');
        });
        return;
      }
      // Persisted session opened on login → go straight to dashboard.
      router.replace('/dashboard');
    }
  }, [admin, isLoading, logout, router, segments]);

  return <>{children}</>;
}
