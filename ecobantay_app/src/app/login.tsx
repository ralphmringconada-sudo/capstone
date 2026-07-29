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
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Shadow } from 'react-native-shadow-2';
import { useRouter, Stack } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { FIREBASE_SETUP_MESSAGE } from '@/config/firebase';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { validateLoginForm } from '@/utils/validation';
import { PasswordInput } from '@/components/PasswordInput';

/**
 * Purpose: Authenticates returning users through email credentials or Google.
 * How it works: 1) validates input/configuration. 2) starts the selected provider flow. 3) updates auth context. 4) navigates home.
 * Technologies Used: React Native, Expo Router, Expo AuthSession, Google OAuth, Firebase Authentication, React Context.
 * Why this implementation: Both providers converge on one authenticated application session and consistent feedback.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { login, loginGoogle, isFirebaseConfigured } = useAuth();
  const { request, response, promptAsync, isGoogleConfigured } = useGoogleAuth();

  /*
   * Form and workflow state: credentials remain controlled locally, while separate
   * pending flags prevent overlapping email and Google authentication attempts.
   */
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  // Locks synchronously before React re-renders, preventing rapid taps from starting duplicate authentication requests.
  const submissionLockRef = useRef(false);

  /**
   * Purpose: Validates and submits an email/password login.
   * How it works: 1) validates fields. 2) calls auth context. 3) routes on success. 4) exposes mapped errors.
   * Technologies Used: React state, Firebase Authentication, Firebase Firestore, Expo Router.
   * Why this implementation: Client validation and centralized auth services keep the screen focused on workflow feedback.
   */
  const handleSignIn = async () => {
    if (submissionLockRef.current) return;
    setError('');
    /* Validation: reject incomplete or malformed credentials before contacting Firebase. */
    const validationError = validateLoginForm(email, password);
    if (validationError) {
      setError(validationError);
      return;
    }

    submissionLockRef.current = true;
    setIsSubmitting(true);
    /* Async authentication flow: lock both login controls until Firebase completes or fails. */
    try {
      await login(email, password);
      router.replace('/home');
    } catch (err) {
      /* Error handling: show safe service-mapped feedback without exposing Firebase internals. */
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  /**
   * Purpose: Opens the external Google authentication prompt.
   * How it works: 1) checks client configuration. 2) marks OAuth pending. 3) launches AuthSession.
   * Technologies Used: Expo AuthSession, Google OAuth, React Native Alert.
   * Why this implementation: Configuration is verified before leaving the app for an external provider flow.
   */
  const handleGoogleSignIn = async () => {
    if (submissionLockRef.current) return;
    if (!isGoogleConfigured) {
      Alert.alert(
        'Google Sign-In Not Configured',
        'Add your Google Web Client ID to the .env file to enable Google sign-in.',
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
      setError('Unable to open Google sign-in.');
      setIsGoogleSubmitting(false);
    }
  };

  /*
   * OAuth lifecycle: inspect the asynchronous AuthSession response, exchange a
   * successful ID token through auth context, and always clear provider loading state.
   */
  useEffect(() => {
    if (response?.type !== 'success') {
      if (response?.type === 'error' || response?.type === 'dismiss') {
        submissionLockRef.current = false;
        setIsGoogleSubmitting(false);
      }
      return;
    }

    const idToken = response.params.id_token;
    if (!idToken) {
      submissionLockRef.current = false;
      setError('Google sign-in failed. Please try again.');
      setIsGoogleSubmitting(false);
      return;
    }

    /* Async authentication flow: complete Firebase login only after Google returns a valid ID token. */
    (async () => {
      try {
        await loginGoogle(idToken);
        router.replace('/home');
      } catch (err) {
        /* Error handling: retain the login form and display provider-specific failure feedback. */
        setError(err instanceof Error ? err.message : 'Unable to sign in with Google.');
      } finally {
        submissionLockRef.current = false;
        setIsGoogleSubmitting(false);
      }
    })();
  }, [response, loginGoogle, router]);

  const isBusy = isSubmitting || isGoogleSubmitting;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#9FC37F" />
      
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        
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
          <Text style={styles.subtitle}>Please enter your credentials</Text>
        </View>

        <View style={styles.formSection}>
          
          <Text style={styles.pageTitle}>LOGIN</Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#83a96e"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!isBusy}
          />

          <PasswordInput
            containerStyle={styles.inputMargin}
            placeholder="Password"
            placeholderTextColor="#83a96e"
            value={password}
            onChangeText={setPassword}
            editable={!isBusy}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {!isFirebaseConfigured ? (
            <Text style={styles.configText}>{FIREBASE_SETUP_MESSAGE}</Text>
          ) : null}

          <View style={styles.loginButtonContainer}>
            <Shadow 
              distance={2} 
              startColor={'rgba(0, 0, 0, 0.25)'} 
              offset={[0, 2]} 
              style={{ width: '100%' }}
            >
              <TouchableOpacity
                activeOpacity={0.8}
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
            </Shadow>
          </View>

          <View style={styles.linksContainer}>
            <Text style={styles.helperText}>
              Don't have an account? <Text style={styles.linkText} onPress={() => router.navigate('/signup')}>create one!</Text>
            </Text>
            <Text style={styles.helperText}>
              Did you{' '}
              <Text style={styles.linkText} onPress={() => router.navigate('/forgot-password')}>
                forget your password?
              </Text>
            </Text>
          </View>

          <View style={styles.googleButtonContainer}>
            <Shadow 
              distance={2} 
              startColor={'rgba(0, 0, 0, 0.1)'} 
              offset={[0, 2]} 
              style={{ alignSelf: 'center', borderRadius: 24 }}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                style={[styles.googleButton, (isBusy || !request) && styles.buttonDisabled]}
                onPress={handleGoogleSignIn}
                disabled={isBusy || !request}
              >
                {isGoogleSubmitting ? (
                  <ActivityIndicator color="#000000" />
                ) : (
                  <>
                    <Image 
                      source={require('@/assets/images/google_logo.png')} 
                      style={styles.googleIconImage}
                      resizeMode="contain"
                    />
                    <Text style={styles.googleButtonText}>Sign in with Google</Text>
                  </>
                )}
              </TouchableOpacity>
            </Shadow>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            property of the local government unit of{'\n'}Valencia, Negros Oriental, Philippines
          </Text>
        </View>

      </KeyboardAvoidingView>
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
    paddingTop: 20, 
    paddingBottom: 32,
    justifyContent: 'space-between',
  },
  topBar: {
    width: '100%',
    alignItems: 'flex-start',
    marginBottom: -15, 
    marginTop: 15, 
  },
  backButton: {
    padding: 8,
    marginLeft: -8, 
  },
  backArrowImage: {
    width: 24,
    height: 24,
    tintColor: '#3f5c2b',
  },
  header: {
    alignItems: 'center',
    marginTop: -20, 
  },
  brandImage: {
    width: 320,            
    height: 90,            
    transform: [{ translateX: -10 }], 
  },
  subtitle: {
    fontFamily: 'Montserrat-Regular',
    color: '#3f5c2b',
    fontSize: 14,
    marginTop: -4, 
  },
  formSection: {
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
    alignItems: 'center',
  },
  pageTitle: {
    fontFamily: 'Montserrat-Bold',
    color: '#407e41',
    fontSize: 28,
    letterSpacing: 1,
    marginBottom: 0,
  },
  input: {
    width: '100%',
    backgroundColor: '#3f5c2b',
    color: '#ffffff',
    height: 44, 
    paddingHorizontal: 16,
    paddingVertical: 0,
    borderRadius: 6,
    fontSize: 16,
    fontFamily: 'Montserrat-Regular',
    textAlignVertical: 'center', 
    includeFontPadding: false,
  },
  inputMargin: {
    marginTop: 10, 
  },
  errorText: {
    marginTop: 12,
    color: '#8b1e1e',
    fontFamily: 'Montserrat-Regular',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  configText: {
    marginTop: 12,
    color: '#5a3d00',
    fontFamily: 'Montserrat-Regular',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
    paddingHorizontal: 8,
  },
  loginButtonContainer: {
    width: '100%',
    marginTop: 40,
    maxWidth: 260, 
  },
  button: {
    width: '100%',
    backgroundColor: '#3B703C',
    height: 48,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    fontFamily: 'Montserrat-Bold', 
    color: '#ffffff',
    fontSize: 20,
    letterSpacing: 2,
    includeFontPadding: false,
  },
  linksContainer: {
    marginTop: 8, 
    alignItems: 'center',
  },
  helperText: {
    fontFamily: 'Montserrat-Regular',
    color: '#3f5c2b',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  linkText: {
    textDecorationLine: 'underline',
  },
  googleButtonContainer: {
    marginTop: 32,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    height: 44,
    paddingHorizontal: 24,
    borderRadius: 24, 
    minWidth: 220,
  },
  googleIconImage: {
    width: 20, 
    height: 20,
    marginRight: 12,
  },
  googleButtonText: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 12,
    color: '#000000',
    includeFontPadding: false,
  },
  footer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  footerText: {
    fontFamily: 'Montserrat-Regular', 
    textAlign: 'center',
    color: '#3f5c2b',
    fontSize: 10,
    paddingHorizontal: 40,
  },
});
