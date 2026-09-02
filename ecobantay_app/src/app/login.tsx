import React, { useRef, useState } from 'react';
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
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { FIREBASE_SETUP_MESSAGE } from '@/config/firebase';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { validateLoginForm } from '@/utils/validation';

/**
 * Purpose: Authenticates returning users with email/password or Google.
 * How it works: 1) validates fields. 2) signs in through auth context. 3) navigates home on success.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { login, loginGoogle, isFirebaseConfigured } = useAuth();
  const { request, signInWithGoogle, isGoogleConfigured } = useGoogleAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const submissionLockRef = useRef(false);

  const handleSignIn = async () => {
    if (submissionLockRef.current) return;
    setError('');

    const validationError = validateLoginForm(email, password);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!isFirebaseConfigured) {
      setError(FIREBASE_SETUP_MESSAGE);
      return;
    }

    submissionLockRef.current = true;
    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace('/home');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to sign in.';
      if (message.toLowerCase().includes('verify your email')) {
        router.replace({
          pathname: '/verify-email' as '/login',
          params: { email: email.trim().toLowerCase() },
        });
        return;
      }
      setError(message);
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
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
      const idToken = await signInWithGoogle();
      if (!idToken) {
        return;
      }
      await loginGoogle(idToken);
      router.replace('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in with Google.');
    } finally {
      submissionLockRef.current = false;
      setIsGoogleSubmitting(false);
    }
  };

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
            LOGIN
          </Text>

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

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.button, isBusy && styles.buttonDisabled]}
            onPress={handleSignIn}
            disabled={isBusy}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Log In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.googleButton, (isBusy || !request) && styles.buttonDisabled]}
            onPress={handleGoogleSignIn}
            disabled={isBusy || !request}
          >
            {isGoogleSubmitting ? (
              <ActivityIndicator color="#3f5c2b" />
            ) : (
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.helperText}>
            Don't have an account?{' '}
            <Text style={styles.linkText} onPress={() => router.push('/signup')}>
              create one!
            </Text>
          </Text>
          <Text style={styles.helperText}>
            Forgot password?{' '}
            <Text style={styles.linkText} onPress={() => router.push('/forgot-password')}>
              Reset here
            </Text>
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
    marginBottom: 12,
  },
  passwordRow: {
    width: '100%',
    maxWidth: 320,
    position: 'relative',
    marginBottom: 12,
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
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    fontFamily: 'Montserrat-Bold',
    color: '#ffffff',
    fontSize: 18,
  },
  helperText: {
    fontFamily: 'Montserrat-Regular',
    color: '#3f5c2b',
    fontSize: 13,
    marginTop: 14,
    textAlign: 'center',
  },
  linkText: {
    textDecorationLine: 'underline',
    fontFamily: 'Montserrat-Bold',
  },
});
