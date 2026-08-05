import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Purpose: Transitions from the native splash screen into the rendered application.
 * How it works: 1) waits briefly for first paint. 2) hides Expo's splash. 3) fades the overlay out.
 * Technologies Used: Expo SplashScreen, Expo Image, React state.
 * Why this implementation: Avoids Reanimated/worklets on startup, which can crash release APKs.
 */
export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let cancelled = false;

    SplashScreen.hideAsync()
      .catch(() => undefined)
      .finally(() => {
        setTimeout(() => {
          if (!cancelled) {
            setVisible(false);
          }
        }, 450);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  return (
    <View style={styles.splashOverlay}>
      <Image
        style={styles.image}
        source={require('@/assets/images/Ecobantay_Logo.png')}
        contentFit="contain"
      />
    </View>
  );
}

/**
 * Purpose: Renders EcoBantay branding used during startup animations.
 * How it works: Shows the EcoBantay logo centered in a fixed frame.
 * Technologies Used: Expo Image and React Native layout.
 * Why this implementation: Keeps branding consistent without Expo template assets.
 */
export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <Image
        style={styles.brandImage}
        source={require('@/assets/images/Ecobantay_Logo.png')}
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 280,
    height: 120,
    zIndex: 100,
  },
  brandImage: {
    width: 260,
    height: 90,
  },
  image: {
    width: 280,
    height: 96,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#95c17e',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
