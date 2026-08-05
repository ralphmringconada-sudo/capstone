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
import { useRouter } from 'expo-router';
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
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    setIsSubmitting(true);
    try {
      await sendForgotPasswordEmail(email.trim());
      Alert.alert(
        'Email Sent',
        'Check your inbox for a password reset link.',
        [{ text: 'OK', onPress: () => router.replace('/login') }],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send reset email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#9FC37F" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.content}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Image
          source={require('@/assets/images/Ecobantay_Logo.png')}
          style={styles.brandImage}
          resizeMode="contain"
        />
        <Text style={styles.subtitle}>Reset your account password</Text>
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

        <TouchableOpacity
          activeOpacity={0.85}
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
  backButton: { position: 'absolute', top: 24, left: 24, zIndex: 2 },
  backText: { fontFamily: 'Montserrat-Bold', color: '#3f5c2b', fontSize: 16 },
  brandImage: { width: 180, height: 48, alignSelf: 'center', marginBottom: 8 },
  subtitle: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 14,
    color: '#3f5c2b',
    textAlign: 'center',
    marginBottom: 16,
  },
  pageTitle: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 24,
    color: '#3f5c2b',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#3f5c2b',
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 48,
    fontFamily: 'Montserrat-Regular',
    fontSize: 16,
    color: '#ffffff',
    marginBottom: 16,
  },
  errorText: {
    color: '#8B1E1E',
    fontFamily: 'Montserrat-Bold',
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
