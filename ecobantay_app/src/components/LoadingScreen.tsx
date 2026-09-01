import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import AnimatedTracedLogo from '@/components/AnimatedTracedLogo';

const LOGO_SIZE = 100;

/**
 * Purpose: Presents branded feedback while an application workflow is pending.
 * How it works: renders the static wordmark above the animated traced-logo mark, full-screen and centered.
 * Technologies Used: React and React Native.
 * Why this implementation: A reusable full-screen state prevents blank interfaces during startup and authentication.
 */
export default function LoadingScreen() {
  return (
    <View style={styles.container}>
      <Image
        source={require('@/assets/images/Ecobantay_Logo.png')}
        style={styles.wordmark}
        resizeMode="contain"
      />
      <AnimatedTracedLogo size={LOGO_SIZE} lines={1} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#95c17e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wordmark: {
    width: 320,
    height: 90,
    marginBottom: 40,
    transform: [{ translateX: -20 }],
  },
});