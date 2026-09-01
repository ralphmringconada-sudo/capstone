import React, { useMemo, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import {
  checkEmailVerifiedAndSignIn,
  resendEmailVerification,
} from '@/services/authService';
import { isFirebaseConfigured, FIREBASE_SETUP_MESSAGE } from '@/config/firebase';

/**
 * Purpose: Keeps email/password signups inactive until the user verifies their inbox link.
 * How it works: shows the target email, resends verification, and unlocks login after Firebase marks emailVerified.
 */
export default function VerifyEmailScreen() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const email = useMemo(() => {
    const value = Array.isArray(params.email) ? params.email[0] : params.email;
    return (value || '').trim().toLowerCase();
  }, [params.email]);

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(
    'We sent a verification link to your email. Open it to activate your account.',
  );
  const [isResending, setIsResending] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const handleResend = async () => {
    setError('');
    if (!isFirebaseConfigured()) {
      setError(FIREBASE_SETUP_MESSAGE);
      return;
    }
    if (!email) {
      setError('Missing email address. Please sign up again.');
      return;
    }
    if (!password) {
      setError('Enter your password to resend the verification email.');
      return;
    }

    setIsResending(true);
    try {
      await resendEmailVerification(email, password);
      setInfo('Verification email sent again. Check your inbox and spam folder.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resend verification email.');
    } finally {
      setIsResending(false);
    }
  };

  const handleVerified = async () => {
    setError('');
    if (!isFirebaseConfigured()) {
      setError(FIREBASE_SETUP_MESSAGE);
      return;
    }
    if (!email) {
      setError('Missing email address. Please sign up again.');
      return;
    }
    if (!password) {
      setError('Enter your password to confirm verification.');
      return;
    }

    setIsChecking(true);
    try {
      const verified = await checkEmailVerifiedAndSignIn(email, password);
      if (!verified) {
        setError('Email is not verified yet. Open the link in your inbox, then try again.');
        return;
      }
      await refreshUser();
      Alert.alert('Account activated', 'Your email is verified. You can use EcoBantay now.', [
        { text: 'Continue', onPress: () => router.replace('/home') },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to confirm verification.');
    } finally {
      setIsChecking(false);
    }
  };

  const busy = isResending || isChecking;

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
          <Image
            source={require('@/assets/images/Ecobantay_Logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Verify your email</Text>
          <Text style={styles.subtitle}>{info}</Text>

          {email ? (
            <View style={styles.emailChip}>
              <Text style={styles.emailLabel}>SENT TO</Text>
              <Text style={styles.emailValue}>{email}</Text>
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>Password</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.input}
              placeholder="Enter your password"
              placeholderTextColor="#6B7B6C"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              editable={!busy}
            />
            <TouchableOpacity onPress={() => setShowPassword((prev) => !prev)} disabled={busy}>
              <Text style={styles.toggle}>{showPassword ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.disabled]}
            onPress={handleVerified}
            disabled={busy}
          >
            {isChecking ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>I verified my email</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, busy && styles.disabled]}
            onPress={handleResend}
            disabled={busy}
          >
            {isResending ? (
              <ActivityIndicator color="#145C1E" />
            ) : (
              <Text style={styles.secondaryText}>Resend verification email</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/login')} disabled={busy}>
            <Text style={styles.link}>Back to login</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E1F0B9' },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 48,
  },
  logo: { width: 120, height: 120, alignSelf: 'center', marginBottom: 12 },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#145C1E',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#3F5741',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  emailChip: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  emailLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7B6C',
    marginBottom: 4,
  },
  emailValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#145C1E',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3F5741',
    marginBottom: 6,
  },
  inputBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C9D9BE',
    paddingHorizontal: 14,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  input: { flex: 1, fontSize: 15, color: '#1D2B1E' },
  toggle: { color: '#145C1E', fontWeight: '700', fontSize: 13 },
  error: { color: '#A93131', marginBottom: 10, fontWeight: '600' },
  primaryButton: {
    backgroundColor: '#34733B',
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondaryButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#34733B',
  },
  secondaryText: { color: '#145C1E', fontWeight: '800', fontSize: 15 },
  disabled: { opacity: 0.7 },
  link: {
    marginTop: 18,
    textAlign: 'center',
    color: '#145C1E',
    fontWeight: '700',
    fontSize: 14,
  },
});
