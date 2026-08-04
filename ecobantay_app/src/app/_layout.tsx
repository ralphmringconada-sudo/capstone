import 'react-native-gesture-handler';

import React, { useState, useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useColorScheme, View, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { Asset } from 'expo-asset';

import LoadingScreen from '@/components/LoadingScreen';
import { AuthProvider } from '@/context/AuthContext';
import { AppNavigator } from '@/components/AppNavigator';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const CustomTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#95c17e',
  },
};

/**
 * Purpose: Establishes the application root after required startup resources are ready.
 * How it works: 1) preloads fonts and branding. 2) always mounts navigation. 3) overlays loading until assets finish.
 * Technologies Used: React hooks, Expo Font, Expo Asset, Expo SplashScreen, React Navigation, React Context.
 * Why this implementation: Navigation must stay mounted so auth routes never fall through to the system browser.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [isAppReady, setIsAppReady] = useState(false);

  useEffect(() => {
    async function prepareApp() {
      try {
        await Promise.all([
          Font.loadAsync({
            'Montserrat-Regular': require('@/assets/fonts/Montserrat-Regular.ttf'),
            'Montserrat-Bold': require('@/assets/fonts/Montserrat-ExtraBold.ttf'),
            'Montserrat-Semi-Bold': require('@/assets/fonts/Montserrat-Bold.ttf'),
          }),
          Asset.loadAsync(require('@/assets/images/Ecobantay_Logo.png')),
        ]);
      } catch (e) {
        console.warn('Error loading assets:', e);
      } finally {
        setIsAppReady(true);
        await SplashScreen.hideAsync().catch(() => undefined);
      }
    }

    prepareApp();
  }, []);

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : CustomTheme}>
        <AppNavigator />
        {!isAppReady ? (
          <View style={styles.loadingOverlay} pointerEvents="auto">
            <LoadingScreen message="Ecobantay is Loading..." />
          </View>
        ) : null}
      </ThemeProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
});
