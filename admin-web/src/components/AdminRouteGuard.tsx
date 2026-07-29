import { useEffect } from 'react';
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
 * 3. Authenticated administrators are redirected away from the login route.
 * Technologies Used: React effects, Expo Router, and the admin authentication context.
 * Why this implementation: A layout-level guard applies one access policy to the entire route tree.
 */
export function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const { admin, isLoading } = useAdminAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const currentRoute = segments[0] ?? 'index';
    const isPublic = PUBLIC_ROUTES.includes(currentRoute);
    const isProtected = PROTECTED_ROUTES.includes(currentRoute);

    /*
     * Apply both sides of the route policy only after session restoration finishes:
     * protected pages require an admin, while the login page should not remain open after sign-in.
     */
    if (!admin && isProtected) {
      router.replace('/');
      return;
    }

    if (admin && isPublic) {
      router.replace('/dashboard');
    }
  }, [admin, isLoading, router, segments]);

  return <>{children}</>;
}
