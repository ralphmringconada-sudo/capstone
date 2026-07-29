import React, { useState, useEffect } from 'react';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';

import { useColorScheme } from 'react-native';

import * as SplashScreen from 'expo-splash-screen';

import * as Font from 'expo-font';

import { Asset } from 'expo-asset';



import { AnimatedSplashOverlay } from '@/components/animated-icon';

import LoadingScreen from '@/components/LoadingScreen';

import { AuthProvider } from '@/context/AuthContext';

import { AppNavigator } from '@/components/AppNavigator';



SplashScreen.preventAutoHideAsync();



const CustomTheme = {

  ...DefaultTheme,

  colors: {

    ...DefaultTheme.colors,

    background: '#95c17e',

  },

};



/**
 * Purpose: Establishes the application root after required startup resources are ready.
 * How it works: 1) preloads fonts and branding. 2) shows loading feedback. 3) mounts theme, auth, and navigation providers.
 * Technologies Used: React hooks, Expo Font, Expo Asset, Expo SplashScreen, React Navigation, React Context.
 * Why this implementation: Deferring the interface prevents missing-font flashes and ensures shared providers wrap every route.
 */
export default function RootLayout() {

  const colorScheme = useColorScheme();

  /*
   * Startup state: isAppReady gates the provider tree until required fonts and
   * image assets have either loaded successfully or completed error handling.
   */
  const [isAppReady, setIsAppReady] = useState(false);



  useEffect(() => {

    /**
     * Purpose: Preloads resources required for the first rendered application frame.
     * How it works: 1) starts font and image loads concurrently. 2) waits for both. 3) marks startup complete.
     * Technologies Used: Expo Font, Expo Asset, JavaScript Promise.all, React state.
     * Why this implementation: Parallel loading minimizes startup delay while guaranteeing visual assets are available.
     */
    async function prepareApp() {

      try {

        const fontPromise = Font.loadAsync({

          'Montserrat-Regular': require('@/assets/fonts/Montserrat-Regular.ttf'),

          'Montserrat-Bold': require('@/assets/fonts/Montserrat-ExtraBold.ttf'),

          'Montserrat-Semi-Bold': require('@/assets/fonts/Montserrat-Bold.ttf'),

        });



        const imagePromise = Asset.loadAsync(

          require('@/assets/images/Ecobantay_Logo.png'),

        );



        /* Async startup flow: wait for both independent asset groups before releasing the loading screen. */
        await Promise.all([fontPromise, imagePromise]);

      } catch (e) {
        /* Error handling: report startup failures for diagnosis while still allowing the readiness cleanup to run. */

        console.warn('Error loading assets:', e);

      } finally {

        setIsAppReady(true);

        await SplashScreen.hideAsync();

      }

    }



    prepareApp();

  }, []);



  return (

    <AuthProvider>

      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : CustomTheme}>

        {!isAppReady ? (

          <LoadingScreen message="Ecobantay is Loading..." />

        ) : (

          <>

            <AnimatedSplashOverlay />

            <AppNavigator />

          </>

        )}

      </ThemeProvider>

    </AuthProvider>

  );

}


