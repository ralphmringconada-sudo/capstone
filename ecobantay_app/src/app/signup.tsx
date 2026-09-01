import React, { useEffect, useRef, useState } from 'react';
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
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { FIREBASE_SETUP_MESSAGE } from '@/config/firebase';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { validateSignUpForm } from '@/utils/validation';

/**
 * Purpose: Creates a new EcoBantay account with email or Google registration.
 * How it works: 1) collects profile fields. 2) validates. 3) registers through auth context. 4) requires email verify for email accounts.
 */
export default function SignUpScreen() {
  const router = useRouter();
  const { register, registerGoogle, logout, isFirebaseConfigured } = useAuth();
  const { request, response, promptAsync, isGoogleConfigured } = useGoogleAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthdayText, setBirthdayText] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const submissionLockRef = useRef(false);

  const parseBirthday = (value: string): Date | null => {
    const trimmed = value.trim();
    // Accept MM/DD/YYYY
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
    if (!match) return null;
    const month = Number(match[1]) - 1;
    const day = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(year, month, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month ||
      date.getDate() !== day
    ) {
      return null;
    }
    if (date > new Date()) return null;
    return date;
  };

  const handleSignUp = async () => {
    if (submissionLockRef.current) return;
    setError('');

    if (!isFirebaseConfigured) {
      setError(FIREBASE_SETUP_MESSAGE);
      return;
    }

    const birthday = parseBirthday(birthdayText);
    if (!birthday) {
      setError('Enter birthday as MM/DD/YYYY (for example 01/15/2000).');
      return;
    }

    const validationError = validateSignUpForm({
      firstName,
      lastName,
      email,
      contactNumber,
      password,
      confirmPassword,
      birthday,
      hasSelectedDate: true,
    });

    if (validationError) {
      setError(validationError);
      return;
    }

    submissionLockRef.current = true;
    setIsSubmitting(true);
    try {
      await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        contactNumber: contactNumber.trim(),
        password,
        birthday,
      });
      await logout();
      router.replace({
        pathname: '/verify-email',
        params: { email: email.trim().toLowerCase() },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create account.');
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignUp = async () => {
    if (submissionLockRef.current) return;
    if (!isGoogleConfigured) {
      Alert.alert(
        'Google Sign-In Not Configured',
        'Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to your .env file (Firebase → Authentication → Google → Web client ID).',
      );
      return;
    }

    setError('');
    submissionLockRef.current = true;
    setIsGoogleSubmitting(true);
    try {
      await promptAsync();
    } catch {
      submissionLockRef.current = false;
      setError('Unable to open Google sign-up.');
      setIsGoogleSubmitting(false);
    }
  };

  useEffect(() => {
    if (response?.type !== 'success') {
      if (response?.type === 'error' || response?.type === 'dismiss') {
        submissionLockRef.current = false;
        setIsGoogleSubmitting(false);
      }
      return;
    }

    const idToken =
      response.params.id_token ??
      (response as { authentication?: { idToken?: string } }).authentication?.idToken;
    if (!idToken) {
      submissionLockRef.current = false;
      setError('Google sign-up failed. Please try again.');
      setIsGoogleSubmitting(false);
      return;
    }

    (async () => {
      try {
        await registerGoogle(idToken);
        router.replace('/home');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to sign up with Google.');
      } finally {
        submissionLockRef.current = false;
        setIsGoogleSubmitting(false);
      }
    })();
  }, [response, registerGoogle, router]);

  const isBusy = isSubmitting || isGoogleSubmitting;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#E1F0B9" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <Image
            source={require('@/assets/images/Ecobantay_Logo.png')}
            style={styles.brandImage}
            resizeMode="contain"
          />
          <Text style={styles.subtitle}>Please enter your credentials</Text>
          <Text style={styles.pageTitle} numberOfLines={1} allowFontScaling={false}>
            SIGN UP
          </Text>

          <TextInput
            style={styles.input}
            placeholder="First Name"
            placeholderTextColor="#83a96e"
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            editable={!isBusy}
          />
          <TextInput
            style={[styles.input, styles.groupBottom]}
            placeholder="Last Name"
            placeholderTextColor="#83a96e"
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
            editable={!isBusy}
          />

          <TextInput
            style={[styles.input, styles.groupBottom]}
            placeholder="Birthday (MM/DD/YYYY)"
            placeholderTextColor="#83a96e"
            value={birthdayText}
            onChangeText={setBirthdayText}
            keyboardType="numbers-and-punctuation"
            editable={!isBusy}
          />

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#83a96e"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isBusy}
          />
          <TextInput
            style={[styles.input, styles.groupBottom]}
            placeholder="Contact (09XXXXXXXXX)"
            placeholderTextColor="#83a96e"
            value={contactNumber}
            onChangeText={setContactNumber}
            keyboardType="phone-pad"
            editable={!isBusy}
          />

          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Password"
              placeholderTextColor="#83a96e"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              editable={!isBusy}
            />
            <TouchableOpacity
              style={styles.showButton}
              onPress={() => setShowPassword((value) => !value)}
            >
              <Text style={styles.showText}>{showPassword ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Confirm Password"
            placeholderTextColor="#83a96e"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPassword}
            editable={!isBusy}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.button, isBusy && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={isBusy}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>SIGN UP</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.googleButton, (isBusy || !request) && styles.buttonDisabled]}
            onPress={handleGoogleSignUp}
            disabled={isBusy || !request}
          >
            {isGoogleSubmitting ? (
              <ActivityIndicator color="#3f5c2b" />
            ) : (
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.helperText}>
            Already have an account?{' '}
            <Text style={styles.linkText} onPress={() => router.push('/login')}>
              Sign in!
            </Text>
          </Text>

          <Text style={styles.footerText}>
            property of the local government unit of{'\n'}Valencia, Negros Oriental, Philippines
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E1F0B9' },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 8 },
  backText: { fontFamily: 'Montserrat-Bold', color: '#3f5c2b', fontSize: 16 },
  brandImage: { width: 280, height: 80, marginBottom: 4 },
  subtitle: {
    fontFamily: 'Montserrat-Regular',
    color: '#3f5c2b',
    fontSize: 14,
    marginBottom: 16,
  },
  pageTitle: {
    fontFamily: 'Montserrat-Semi-Bold',
    color: '#407e41',
    fontSize: 28,
    lineHeight: 36,
    marginBottom: 20,
    textAlign: 'center',
    includeFontPadding: false,
  },
  input: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#3f5c2b',
    color: '#ffffff',
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 6,
    fontSize: 16,
    fontFamily: 'Montserrat-Regular',
    marginBottom: 10,
  },
  groupBottom: {
    marginBottom: 24,
  },
  passwordRow: {
    width: '100%',
    maxWidth: 320,
    position: 'relative',
    marginBottom: 10,
  },
  passwordInput: {
    marginBottom: 0,
    paddingRight: 64,
  },
  showButton: {
    position: 'absolute',
    right: 12,
    top: 0,
    height: 48,
    justifyContent: 'center',
  },
  showText: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 12,
    color: '#c2dc68',
  },
  errorText: {
    color: '#8b1e1e',
    fontFamily: 'Montserrat-Regular',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
    maxWidth: 320,
  },
  button: {
    width: '100%',
    maxWidth: 260,
    backgroundColor: '#3B703C',
    height: 48,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.7 },
  googleButton: {
    width: '100%',
    maxWidth: 260,
    backgroundColor: '#ffffff',
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3f5c2b',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  googleButtonText: {
    fontFamily: 'Montserrat-Bold',
    color: '#3f5c2b',
    fontSize: 15,
  },
  buttonText: {
    fontFamily: 'Montserrat-Bold',
    color: '#ffffff',
    fontSize: 18,
  },
  helperText: {
    fontFamily: 'Montserrat-Regular',
    color: '#3f5c2b',
    fontSize: 13,
    marginTop: 16,
    textAlign: 'center',
  },
  linkText: {
    textDecorationLine: 'underline',
    fontFamily: 'Montserrat-Bold',
  },
  footerText: {
    fontFamily: 'Montserrat-Regular',
    color: '#3f5c2b',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 40,
    opacity: 0.8,
  }
});