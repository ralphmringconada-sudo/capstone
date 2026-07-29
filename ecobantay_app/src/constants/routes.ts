export const AUTH_ROUTES = ['index', 'login', 'signup', 'forgot-password'] as const;

export const APP_ROUTES = [
  'home',
  'profile',
  'edit-profile',
  'change-password',
  'create-report',
  'view-report',
  'edit-report',
] as const;

export type AuthRoute = (typeof AUTH_ROUTES)[number];
export type AppRoute = (typeof APP_ROUTES)[number];

/**
 * Purpose: Identifies public authentication route segments.
 * How it works: 1) compares the segment against the route tuple. 2) narrows its TypeScript type.
 * Technologies Used: Expo Router route names and TypeScript type predicates.
 * Why this implementation: Central route classification keeps authentication redirects type-safe.
 */
export function isAuthRoute(route: string | undefined): route is AuthRoute {
  return AUTH_ROUTES.includes(route as AuthRoute);
}

/**
 * Purpose: Identifies route segments that require an authenticated user.
 * How it works: 1) compares the segment against protected routes. 2) narrows its TypeScript type.
 * Technologies Used: Expo Router route names and TypeScript type predicates.
 * Why this implementation: One protected-route definition prevents inconsistent navigation guards.
 */
export function isAppRoute(route: string | undefined): route is AppRoute {
  return APP_ROUTES.includes(route as AppRoute);
}
