import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Image,
  ScrollView,
  ActivityIndicator,
  AppState,
  type AppStateStatus,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { resendEmailVerification } from '@/services/authService';
import { isFirebaseConfigured, FIREBASE_SETUP_MESSAGE } from '@/config/firebase';

/**
 * Purpose: Keeps email/password signups inactive until the inbox verification link is opened.
 * How it works: watches Firebase for emailVerified, then signs the user in without a confirm tap.
 */
export default function VerifyEmailScreen() {
  const router = useRouter();
  const { pendingVerificationEmail, completeEmailVerification, logout } = useAuth();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const email = useMemo(() => {
    const value = Array.isArray(params.email) ? params.email[0] : params.email;
    return (value || pendingVerificationEmail || '').trim().toLowerCase();
  }, [params.email, pendingVerificationEmail]);

  const [error, setError] = useState('');
  const [info, setInfo] = useState(
    'We sent a verification link to your email. Open that link and this screen will sign you in automatically.',
  );
  const [isResending, setIsResending] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const activatingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const tryActivate = async () => {
      if (activatingRef.current || cancelled) return;
      if (!isFirebaseConfigured()) return;

      try {
        activatingRef.current = true;
        const verified = await completeEmailVerification();
        if (cancelled || !verified) return;
        setIsActivating(true);
        setInfo('Email verified. Signing you in…');
        router.replace('/home');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to confirm verification.');
        }
      } finally {
        activatingRef.current = false;
      }
    };

    void tryActivate();
    const interval = setInterval(() => {
      void tryActivate();
    }, 3000);

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        void tryActivate();
      }
    };
    const appSub = AppState.addEventListener('change', onAppState);

    return () => {
      cancelled = true;
      clearInterval(interval);
      appSub.remove();
    };
  }, [completeEmailVerification, router]);

  const handleResend = async () => {
    setError('');
    if (!isFirebaseConfigured()) {
      setError(FIREBASE_SETUP_MESSAGE);
      return;
    }

    setIsResending(true);
    try {
      await resendEmailVerification();
      setInfo('Verification email sent again. Check your inbox and spam folder.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resend verification email.');
    } finally {
      setIsResending(false);
    }
  };

  const handleBackToLogin = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#E1F0B9" />
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

        {isActivating ? <ActivityIndicator color="#145C1E" style={styles.spinner} /> : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.secondaryButton, isResending && styles.disabled]}
          onPress={handleResend}
          disabled={isResending || isActivating}
        >
          {isResending ? (
            <ActivityIndicator color="#145C1E" />
          ) : (
            <Text style={styles.secondaryText}>Resend verification email</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleBackToLogin} disabled={isResending || isActivating}>
          <Text style={styles.link}>Back to login</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E1F0B9' },
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
  spinner: { marginBottom: 12 },
  error: { color: '#A93131', marginBottom: 10, fontWeight: '600' },
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
