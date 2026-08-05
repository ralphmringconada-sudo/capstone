import React from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, StatusBar, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';

/**
 * Purpose: Introduces EcoBantay and directs visitors to authentication choices.
 * How it works: 1) presents project branding. 2) offers login and registration actions. 3) navigates with Expo Router.
 * Technologies Used: React, React Native, Expo Router.
 * Why this implementation: A focused landing screen gives first-time and returning users clear entry paths.
 */
export default function IntroductionScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#E1F0B9" />

      <View style={styles.content}>
        <View style={styles.header}>
          <Image
            source={require('@/assets/images/Ecobantay_Logo.png')}
            style={styles.brandImage}
            resizeMode="contain"
          />
        </View>

        <View style={styles.centerSection}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.button}
            onPress={() => router.push('/login')}
          >
            <Text
              style={styles.buttonText}
              numberOfLines={1}
              allowFontScaling={false}
              android_hyphenationFrequency="none"
            >
              LOGIN
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.button, styles.buttonMargin]}
            onPress={() => router.push('/signup')}
          >
            <Text
              style={styles.buttonText}
              numberOfLines={1}
              allowFontScaling={false}
              android_hyphenationFrequency="none"
            >
              REGISTER
            </Text>
          </TouchableOpacity>

          <Text style={styles.tagline}>
            Help us monitor and keep our beautiful city a wonderful place!
          </Text>
        </View>

        <View style={styles.footer}>
          {/* White Circle Logo Placeholder */}
          <Image
            source={require('@/assets/images/Valencia_Logo.png')}
            style={styles.logoPlaceholder}
            resizeMode="contain"
          />
          
          {/* Footer Text */}
          <Text style={styles.footerText}>
            property of the local government unit of{'\n'}Valencia, Negros Oriental Philippines
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E1F0B9',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 32,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  header: {
    marginTop: 40,
    alignItems: 'center',
    width: '100%',
  },
  brandImage: {
    width: 320,
    height: 90,
    transform: [{ translateX: -20 }],
  },
  centerSection: {
    width: '100%',
    maxWidth: 300,
    marginTop: 48,
  },
  button: {
    width: '100%',
    backgroundColor: '#3B703C',
    minHeight: 52,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    overflow: 'visible',
  },
  buttonMargin: {
    marginTop: 16,
  },
  buttonText: {
    fontFamily: 'Montserrat-Semi-Bold',
    color: '#ffffff',
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  tagline: {
    fontFamily: 'Montserrat-Regular',
    textAlign: 'center',
    color: '#3f5c2b',
    fontSize: 12,
    marginTop: 40,
    paddingHorizontal: 16,
    lineHeight: 16,
  },
  footer: {
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  logoPlaceholder: {
    width: 96,
    height: 96,
    backgroundColor: '#ffffff',
    borderRadius: 48,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: '#83a96e',
  },
  footerText: {
    fontFamily: 'Montserrat-Regular',
    textAlign: 'center',
    color: '#3f5c2b',
    fontSize: 10,
    paddingHorizontal: 40,
  },
});
