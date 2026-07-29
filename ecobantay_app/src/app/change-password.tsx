import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
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
import { useAuth } from '@/context/AuthContext';
import { changeUserPassword } from '@/services/authService';
import { PasswordInput } from '@/components/PasswordInput';
import { getPasswordRequirements, isPasswordValid } from '@/utils/validation';

/**
 * Purpose: Allows an email-authenticated user to securely change their password.
 * How it works: 1) validates provider and password rules. 2) reauthenticates. 3) updates Firebase credentials.
 * Technologies Used: React Native, Firebase Authentication, shared TypeScript validation, Expo Router.
 * Why this implementation: Recent-login verification protects a sensitive credential change from stale sessions.
 */
export default function ChangePasswordScreen() {
  const router = useRouter();
  const { user } = useAuth();
  /*
   * Credential form state: current password supports reauthentication, new and
   * confirmation values enforce consistency, and submission state blocks duplicates.
   */
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user?.authProvider === 'google') {
      Alert.alert(
        'Google Account',
        'Passwords for Google sign-in are managed in your Google Account settings.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    }
  }, [user?.authProvider, router]);

  const requirements = getPasswordRequirements(newPassword);

  /**
   * Purpose: Validates password inputs and performs the credential update.
   * How it works: 1) rejects unsupported providers. 2) checks current/new values. 3) reauthenticates and updates Firebase.
   * Technologies Used: Firebase Authentication, React state, React Native Alert.
   * Why this implementation: Shared password rules and server reauthentication provide both usability and account security.
   */
  const handleSave = async () => {
    setError('');
    if (user?.authProvider === 'google') {
      setError('Google accounts manage passwords in Google, not here.');
      return;
    }
    if (!currentPassword) {
      setError('Current password is required.');
      return;
    }
    if (!isPasswordValid(newPassword)) {
      setError('New password must include 1 uppercase, 1 lowercase, and 1 special character.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    /* Async authentication flow: lock form submission during reauthentication and password update. */
    setIsSubmitting(true);
    try {
      await changeUserPassword(currentPassword, newPassword);
      Alert.alert('Password Updated', 'Your password was changed successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      /* Error handling: preserve the form while presenting the mapped Firebase failure. */
      setError(err instanceof Error ? err.message : 'Failed to change password.');
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
          <Text style={styles.pageTitle}>CHANGE PASSWORD</Text>

          <Text style={styles.label}>Current Password</Text>
          <PasswordInput
            containerStyle={styles.inputMargin}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            editable={!isSubmitting}
          />

          <Text style={styles.label}>New Password</Text>
          <PasswordInput
            containerStyle={styles.inputMargin}
            value={newPassword}
            onChangeText={setNewPassword}
            editable={!isSubmitting}
          />

          <View style={styles.requirements}>
            {requirements.map((item) => (
              <Text key={item.key} style={[styles.requirement, item.met && styles.requirementMet]}>
                {item.met ? '✓' : '○'} {item.label}
              </Text>
            ))}
          </View>

          <Text style={styles.label}>Confirm New Password</Text>
          <PasswordInput
            containerStyle={styles.inputMargin}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            editable={!isSubmitting}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Shadow distance={2} startColor={'rgba(0, 0, 0, 0.15)'} offset={[0, 2]} style={{ width: '100%' }}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.button, isSubmitting && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={isSubmitting}
            >
              {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>UPDATE PASSWORD</Text>}
            </TouchableOpacity>
          </Shadow>
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
    marginBottom: 24,
    color: '#000',
  },
  label: { fontFamily: 'Montserrat-Semi-Bold', fontSize: 13, marginBottom: 6, color: '#333' },
  inputMargin: { marginBottom: 16 },
  requirements: { marginBottom: 16, marginTop: -8 },
  requirement: { fontFamily: 'Montserrat-Regular', fontSize: 12, color: '#888', marginBottom: 4 },
  requirementMet: { color: '#3B703C' },
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
});
