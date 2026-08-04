import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import LoadingScreen from '@/components/LoadingScreen';
import { isAppRoute, isAuthRoute } from '@/constants/routes';

/**
 * Purpose: Owns the root Expo Router stack and enforces auth-based redirects.
 * How it works: 1) mounts Stack as the navigator root. 2) waits for auth. 3) redirects protected/public routes.
 * Technologies Used: React hooks, Expo Router, React Context.
 * Why this implementation: Stack must not be wrapped in a layout View or Android navigation can crash.
 */
export function AppNavigator() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const currentRoute = String(segments[0] ?? 'index');

    if (!user && isAppRoute(currentRoute)) {
      router.replace('/');
      return;
    }

    if (user && (isAuthRoute(currentRoute) || currentRoute === 'index')) {
      router.replace('/home');
    }
  }, [user, segments, isLoading, router]);

  return (
    <>
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
        <Stack.Screen name="create-event" />
        <Stack.Screen name="view-event" />
        <Stack.Screen name="edit-event" />
      </Stack>

      {isLoading ? (
        <View style={styles.loadingOverlay} pointerEvents="auto">
          <LoadingScreen message="Ecobantay is Loading..." />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
});
