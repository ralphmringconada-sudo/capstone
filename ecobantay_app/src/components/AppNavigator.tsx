import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import LoadingScreen from '@/components/LoadingScreen';
import { isAppRoute, isAuthRoute } from '@/constants/routes';

/**
 * Purpose: Enforces access rules between public authentication and protected application routes.
 * How it works: 1) reads auth state and route segments. 2) waits for session restoration. 3) redirects invalid access.
 * Technologies Used: React hooks, Expo Router, React Context, Firebase-backed auth state.
 * Why this implementation: A centralized navigation guard prevents protected screens from managing auth independently.
 */
export function AppNavigator() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  /*
   * Authentication lifecycle: delay routing until persisted Firebase state resolves,
   * then direct signed-out users away from protected screens and signed-in users away from auth screens.
   */
  useEffect(() => {
    if (isLoading) return;

    const currentRoute = segments[0] ?? 'index';

    if (!user && isAppRoute(currentRoute)) {
      router.replace('/');
      return;
    }

    // Keep signed-in users on the app; send them home when reopening the app.
    if (user && (isAuthRoute(currentRoute) || currentRoute === 'index')) {
      router.replace('/home');
    }
  }, [user, segments, isLoading, router]);

  if (isLoading) {
    return <LoadingScreen message="Ecobantay is Loading..." />;
  }

  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#95c17e' },
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="home" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="edit-profile" />
      <Stack.Screen name="change-password" />
      <Stack.Screen name="create-report" />
      <Stack.Screen name="view-report" />
      <Stack.Screen name="edit-report" />
    </Stack>
  );
}
