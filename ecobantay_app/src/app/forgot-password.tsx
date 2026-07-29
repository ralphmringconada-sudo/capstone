import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Shadow } from 'react-native-shadow-2';
import { useRouter, Stack } from 'expo-router';
import { sendForgotPasswordEmail } from '@/services/authService';
import { validateEmail } from '@/utils/validation';
import { isFirebaseConfigured, FIREBASE_SETUP_MESSAGE } from '@/config/firebase';

/**
 * Purpose: Starts secure password recovery for an email account.
 * How it works: 1) validates email and Firebase setup. 2) requests a reset email. 3) confirms delivery and returns to login.
 * Technologies Used: React Native, Expo Router, Firebase Authentication.
 * Why this implementation: Firebase manages reset tokens securely while the screen provides clear workflow feedback.
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  /*
   * Recovery state: the controlled email remains available after failures, while
   * error and submission flags provide feedback and prevent duplicate requests.
   */
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Purpose: Validates and submits the password-reset request.
   * How it works: 1) validates email/configuration. 2) calls Firebase service. 3) reports success or mapped failure.
   * Technologies Used: Firebase Authentication, React state, React Native Alert, Expo Router.
   * Why this implementation: Local validation avoids invalid network calls and preserves a simple recovery path.
   */
  const handleReset = async () => {
    setError('');
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    if (!isFirebaseConfigured()) {
      setError(FIREBASE_SETUP_MESSAGE);
      return;
    }

    /* Async Firebase flow: disable repeat requests until the reset-email operation settles. */
    setIsSubmitting(true);
    try {
      await sendForgotPasswordEmail(email);
      Alert.alert(
        'Email Sent',
        'Check your inbox for a password reset link.',
        [{ text: 'OK', onPress: () => router.replace('/login') }],
      );
    } catch (err) {
      /* Error handling: keep the email available for correction or retry. */
      setError(err instanceof Error ? err.message : 'Unable to send reset email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#9FC37F" />
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.content}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Image
              source={require('@/assets/images/back_arrow.png')}
              style={styles.backArrowImage}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>

        <View style={styles.header}>
          <Image
            source={require('@/assets/images/Ecobantay_Logo.png')}
            style={styles.brandImage}
            resizeMode="contain"
          />
          <Text style={styles.subtitle}>Reset your account password</Text>
        </View>

        <Text style={styles.pageTitle}>FORGOT PASSWORD</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#83a96e"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!isSubmitting}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Shadow distance={2} startColor={'rgba(0, 0, 0, 0.25)'} offset={[0, 2]} style={{ width: '100%' }}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.button, isSubmitting && styles.buttonDisabled]}
            onPress={handleReset}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>SEND RESET LINK</Text>
            )}
          </TouchableOpacity>
        </Shadow>

        <Text style={styles.helperText}>
          Remembered it?{' '}
          <Text style={styles.linkText} onPress={() => router.replace('/login')}>
            Back to login
          </Text>
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#9FC37F' },
  content: { flex: 1, paddingHorizontal: 28, justifyContent: 'center' },
  topBar: { marginBottom: 12 },
  backButton: { padding: 8, alignSelf: 'flex-start', marginLeft: -8 },
  backArrowImage: { width: 24, height: 24, tintColor: '#3f5c2b' },
  header: { alignItems: 'center', marginBottom: 24 },
  brandImage: { width: 180, height: 48, marginBottom: 8 },
  subtitle: { fontFamily: 'Montserrat-Regular', fontSize: 14, color: '#3f5c2b' },
  pageTitle: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 28,
    color: '#3f5c2b',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'Montserrat-Regular',
    fontSize: 16,
    color: '#333',
    marginBottom: 16,
  },
  errorText: {
    color: '#8B1E1E',
    fontFamily: 'Montserrat-Semi-Bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#3B703C',
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontFamily: 'Montserrat-Bold', fontSize: 16 },
  helperText: {
    marginTop: 20,
    textAlign: 'center',
    fontFamily: 'Montserrat-Regular',
    color: '#3f5c2b',
  },
  linkText: { fontFamily: 'Montserrat-Bold', textDecorationLine: 'underline' },
});
