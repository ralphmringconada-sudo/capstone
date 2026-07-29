import React from 'react';
import { View, ActivityIndicator, StyleSheet, Image, Text } from 'react-native';

/**
 * Purpose: Presents branded feedback while an application workflow is pending.
 * How it works: 1) renders the EcoBantay logo. 2) displays activity feedback. 3) shows the supplied status message.
 * Technologies Used: React and React Native.
 * Why this implementation: A reusable full-screen state prevents blank interfaces during startup and authentication.
 */
export default function LoadingScreen({ message = 'Loading...' }: { message?: string }) {
  return (
    <View style={styles.container}>
      <Image
        source={require('@/assets/images/Ecobantay_Logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />

      <ActivityIndicator size="large" color="#ffffff" />

      <Text style={styles.messageText}>{message}</Text>
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
  logo: {
    width: 320,
    height: 90,
    marginBottom: 40,
    transform: [{ translateX: -20 }],
  },
  messageText: {
    fontFamily: 'Montserrat-Regular',
    color: '#ffffff',
    fontSize: 16,
    marginTop: 24,
    letterSpacing: 1,
    fontWeight: '600',
  },
});
