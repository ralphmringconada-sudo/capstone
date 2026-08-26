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
  ScrollView,
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
 * Why this implementation: Firebase manages reset tokens securely while the screen provides clear workflow feedback,
 * structured and styled to match the app's other authenticated screens (e.g. Edit Profile) for a consistent experience.
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
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Image source={require('@/assets/images/back_arrow.png')} style={styles.backArrowImage} resizeMode="contain" />
        </TouchableOpacity>
        <Image source={require('@/assets/images/Ecobantay_Logo_2.png')} style={styles.brandImage} resizeMode="contain" />
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.pageTitle}>FORGOT PASSWORD</Text>
          <Text style={styles.subtitle}>
            Enter the email associated with your account and we'll send you a link to reset your password.
          </Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#a0a0a0"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!isSubmitting}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Shadow distance={2} startColor={'rgba(0, 0, 0, 0.15)'} offset={[0, 2]} style={{ width: '100%' }}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.button, isSubmitting && styles.buttonDisabled]}
              onPress={handleReset}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  topHeader: {
    backgroundColor: '#E1F0B9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
    paddingTop: Platform.select({ android: 30, ios: 8, default: 0 }),
  },
  backButton: { padding: 8, marginLeft: -8 },
  backArrowImage: { width: 24, height: 24, tintColor: '#3f5c2b' },
  brandImage: { width: 130, height: 32 },
  scrollContent: { padding: 24, paddingBottom: 40 },
  pageTitle: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 22,
    textAlign: 'center',
    marginBottom: 12,
    color: '#000',
  },
  subtitle: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 13,
    textAlign: 'center',
    color: '#555',
    marginBottom: 24,
    lineHeight: 18,
  },
  label: { fontFamily: 'Montserrat-Semi-Bold', fontSize: 13, marginBottom: 6, color: '#333' },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 16,
    fontFamily: 'Montserrat-Regular',
    fontSize: 14,
    color: '#333',
  },
  errorText: { color: '#e74c3c', textAlign: 'center', marginBottom: 12, fontFamily: 'Montserrat-Semi-Bold' },
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
    color: '#555',
    fontSize: 13,
  },
  linkText: { fontFamily: 'Montserrat-Bold', color: '#3B703C', textDecorationLine: 'underline' },
});