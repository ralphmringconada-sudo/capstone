import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import AnimatedTracedLogo from '@/components/AnimatedTracedLogo';

const LOGO_SIZE = 38;

/**
 * Purpose: Signals that a background action is running without blocking the screen underneath.
 * How it works: shows/hides the traced-logo badge with a plain, unanimated opacity snap.
 * Technologies Used: React Native View styling.
 * Why this implementation: AnimatedTracedLogo stays mounted and its trace loop keeps running
 * continuously regardless of `visible` — no fade-in/out animation rides alongside it, so there's
 * no second, differently-timed transition for the JS-driven trace to visually clash against.
 */
export default function TopLoadingIndicator({ visible }: { visible: boolean }) {
  return (
    <View pointerEvents="none" style={[styles.wrapper, { opacity: visible ? 1 : 0 }]}>
      <AnimatedTracedLogo size={LOGO_SIZE} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: Platform.select({ ios: 50, android: 36, default: 12 }),
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
    elevation: 999,
  },
});