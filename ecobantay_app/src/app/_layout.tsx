import 'react-native-gesture-handler'; //

import React, { useState, useEffect } from 'react'; //[cite: 1]
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'; //[cite: 1]
import { useColorScheme, View, StyleSheet } from 'react-native'; //[cite: 1]
import * as SplashScreen from 'expo-splash-screen'; //[cite: 1]
import * as Font from 'expo-font'; //[cite: 1]
import { Asset } from 'expo-asset'; //[cite: 1]
import { SafeAreaProvider } from 'react-native-safe-area-context'; // <-- ADD THIS IMPORT

import LoadingScreen from '@/components/LoadingScreen'; //[cite: 1]
import { AuthProvider } from '@/context/AuthContext'; //[cite: 1]
import { AppNavigator } from '@/components/AppNavigator'; //[cite: 1]

SplashScreen.preventAutoHideAsync().catch(() => undefined); //[cite: 1]

const CustomTheme = {
  ...DefaultTheme, //[cite: 1]
  colors: {
    ...DefaultTheme.colors, //[cite: 1]
    background: '#95c17e', //[cite: 1]
  },
}; //[cite: 1]

export default function RootLayout() {
  const colorScheme = useColorScheme(); //[cite: 1]
  const [isAppReady, setIsAppReady] = useState(false); //[cite: 1]

  useEffect(() => {
    async function prepareApp() {
      try {
        await Promise.all([
          Font.loadAsync({
            'Montserrat-Regular': require('@/assets/fonts/Montserrat-Regular.ttf'), //[cite: 1]
            'Montserrat-Bold': require('@/assets/fonts/Montserrat-ExtraBold.ttf'), //[cite: 1]
            'Montserrat-Semi-Bold': require('@/assets/fonts/Montserrat-Bold.ttf'), //[cite: 1]
          }), //[cite: 1]
          Asset.loadAsync(require('@/assets/images/Ecobantay_Logo.png')), //[cite: 1]
        ]); //[cite: 1]
      } catch (e) {
        console.warn('Error loading assets:', e); //[cite: 1]
      } finally {
        setIsAppReady(true); //[cite: 1]
        await SplashScreen.hideAsync().catch(() => undefined); //[cite: 1]
      }
    }

    prepareApp(); //[cite: 1]
  }, []); //[cite: 1]

  // --> WRAP EVERYTHING IN SafeAreaProvider BELOW <--
  return (
    <SafeAreaProvider>
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
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, //[cite: 1]
    zIndex: 1000, //[cite: 1]
  },
}); //[cite: 1]