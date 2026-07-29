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
import { Shadow } from 'react-native-shadow-2';
import { useRouter, Stack } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '@/context/AuthContext';
import { FIREBASE_SETUP_MESSAGE } from '@/config/firebase';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { validateSignUpForm } from '@/utils/validation';
import { PasswordInput } from '@/components/PasswordInput';
import { PasswordRequirements } from '@/components/PasswordRequirements';

/**
 * Purpose: Creates a new EcoBantay account through email registration or Google.
 * How it works: 1) collects profile details. 2) validates the selected flow. 3) creates Auth/Firestore records. 4) navigates.
 * Technologies Used: React Native, Expo Router, Expo AuthSession, Google OAuth, Firebase Authentication, Firebase Firestore.
 * Why this implementation: Provider choices share one profile-centered registration outcome for the application.
 */
export default function SignUpScreen() {
  const router = useRouter();
  const { register, registerGoogle, logout, isFirebaseConfigured } = useAuth();
  const { request, response, promptAsync, isGoogleConfigured } = useGoogleAuth();

  /*
   * Registration state: controlled identity, contact, credential, and birthday
   * fields form the profile that is persisted after Firebase creates a UID.
   */
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  // Locks immediately so rapid taps cannot create duplicate Firebase accounts before state disables the controls.
  const submissionLockRef = useRef(false);

  const [birthday, setBirthday] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [hasSelectedDate, setHasSelectedDate] = useState(false);

  /**
   * Purpose: Applies a birthday selected from the native date picker.
   * How it works: 1) falls back to the current value. 2) closes Android picker. 3) marks the field selected.
   * Technologies Used: React state and React Native DateTimePicker.
   * Why this implementation: Explicit selection distinguishes a confirmed birthday from the initial default date.
   */
  const handleDateChange = (_event: unknown, selectedDate?: Date) => {
    const currentDate = selectedDate || birthday;
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    setBirthday(currentDate);
    setHasSelectedDate(true);
  };

  /**
   * Purpose: Validates and submits email-based account registration.
   * How it works: 1) checks Firebase setup and form rules. 2) calls auth context. 3) navigates or reports errors.
   * Technologies Used: React state, Firebase Authentication, Firebase Firestore, Expo Router.
   * Why this implementation: Full validation occurs before coordinated identity and profile persistence.
   */
  const handleSignUp = async () => {
    if (submissionLockRef.current) return;
    setError('');

    if (!isFirebaseConfigured) {
      setError(FIREBASE_SETUP_MESSAGE);
      return;
    }

    /* Validation: evaluate required profile fields, credential strength, and password confirmation together. */
    const validationError = validateSignUpForm({
      firstName,
      lastName,
      email,
      contactNumber,
      password,
      confirmPassword,
      birthday,
      hasSelectedDate,
    });

    if (validationError) {
      setError(validationError);
      return;
    }

    submissionLockRef.current = true;
    setIsSubmitting(true);
    /* Async registration flow: prevent duplicate submissions until Auth and Firestore operations settle. */
    try {
      await register({
        firstName,
        lastName,
        email,
        contactNumber,
        password,
        birthday,
      });
      await logout();
      Alert.alert(
        'Account Created',
        'Your account was created successfully. Please log in to continue.',
        [{ text: 'OK', onPress: () => router.replace('/login') }],
      );
    } catch (err) {
      /* Error handling: preserve entered data and show the service's actionable registration message. */
      setError(err instanceof Error ? err.message : 'Unable to create account.');
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  /**
   * Purpose: Starts Google-based registration through the external provider prompt.
   * How it works: 1) validates OAuth configuration. 2) marks the flow pending. 3) opens AuthSession.
   * Technologies Used: Expo AuthSession, Google OAuth, React Native Alert.
   * Why this implementation: Provider configuration is checked before the user leaves the registration screen.
   */
  const handleGoogleSignUp = async () => {
    if (submissionLockRef.current) return;
    if (!isGoogleConfigured) {
      Alert.alert(
        'Google Sign-In Not Configured',
        'Add your Google Web Client ID to the .env file to enable Google sign-up.',
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

  /*
   * OAuth lifecycle: process the external response, validate the returned ID token,
   * and delegate coordinated Firebase/Firestore registration to auth context.
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
      setError('Google sign-up failed. Please try again.');
      setIsGoogleSubmitting(false);
      return;
    }

    /* Async registration flow: create the application profile only after Google identity succeeds. */
    (async () => {
      try {
        await registerGoogle(idToken);
        await logout();
        Alert.alert(
          'Account Created',
          'Your Google account was registered. Please log in to continue.',
          [{ text: 'OK', onPress: () => router.replace('/login') }],
        );
      } catch (err) {
        /* Error handling: return control to the form with provider-specific registration feedback. */
        setError(err instanceof Error ? err.message : 'Unable to sign up with Google.');
      } finally {
        submissionLockRef.current = false;
        setIsGoogleSubmitting(false);
      }
    })();
  }, [response, registerGoogle, logout, router]);

  const isBusy = isSubmitting || isGoogleSubmitting;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#9FC37F" />
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
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

        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Image 
              source={require('@/assets/images/Ecobantay_Logo.png')} 
              style={styles.brandImage}
              resizeMode="contain"
            />
            <Text style={styles.subtitle}>Please enter your credentials</Text>
          </View>

          <View style={styles.formSection}>
            <Text style={styles.pageTitle}>REGISTER</Text>

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
              style={[styles.input, styles.inputMarginSmall]}
              placeholder="Last Name"
              placeholderTextColor="#83a96e"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              editable={!isBusy}
            />

            <TouchableOpacity 
              activeOpacity={0.8} 
              style={[styles.input, styles.inputMarginLarge, styles.dateInputContainer]}
              onPress={() => setShowDatePicker(true)}
              disabled={isBusy}
            >
              <Text style={[styles.dateText, !hasSelectedDate && styles.placeholderText]}>
                {hasSelectedDate ? birthday.toLocaleDateString() : 'birthday (MM/DD/YYYY)'}
              </Text>
              <Image 
                source={require('@/assets/images/calendar_icon.png')} 
                style={styles.calendarIcon}
                resizeMode="contain"
              />
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={birthday}
                mode="date"
                display="default"
                onChange={handleDateChange}
                maximumDate={new Date()} 
              />
            )}

            <TextInput
              style={[styles.input, styles.inputMarginLarge]}
              placeholder="Email"
              placeholderTextColor="#83a96e"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!isBusy}
            />
            <TextInput
              style={[styles.input, styles.inputMarginSmall]}
              placeholder="Contact Number"
              placeholderTextColor="#83a96e"
              value={contactNumber}
              onChangeText={setContactNumber}
              keyboardType="phone-pad"
              editable={!isBusy}
            />

            <PasswordInput
              containerStyle={styles.inputMarginLarge}
              placeholder="Password"
              placeholderTextColor="#83a96e"
              value={password}
              onChangeText={setPassword}
              editable={!isBusy}
            />

            <PasswordRequirements password={password} confirmPassword={confirmPassword} />

            <PasswordInput
              containerStyle={styles.inputMarginSmall}
              placeholder="Confirm Password"
              placeholderTextColor="#83a96e"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              editable={!isBusy}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {!isFirebaseConfigured ? (
              <Text style={styles.configText}>{FIREBASE_SETUP_MESSAGE}</Text>
            ) : null}

            <View style={styles.mainButtonContainer}>
              <Shadow 
                distance={2} 
                startColor={'rgba(0, 0, 0, 0.15)'} 
                offset={[0, 2]} 
                style={{ width: '100%' }}
              >
                <TouchableOpacity
                  activeOpacity={0.8}
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
              </Shadow>
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
                  onPress={handleGoogleSignUp}
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
                      <Text style={styles.googleButtonText}>Sign up with Google</Text>
                    </>
                  )}
                </TouchableOpacity>
              </Shadow>
            </View>

            <View style={styles.linksContainer}>
              <Text style={styles.helperText}>
                Already have an account?{' '}
                <Text style={styles.linkText} onPress={() => router.navigate('/login')}>
                  Sign in!
                </Text>
              </Text>
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              property of the local government unit of{'\n'}Valencia, Negros Oriental, Philippines
            </Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#9FC37F',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 32,
    justifyContent: 'space-between',
  },
  topBar: {
    position: 'absolute',
    top: 35,              
    left: 24,
    zIndex: 10,
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
    marginTop: 0,
  },
  brandImage: {
    width: 320,            
    height: 90,            
    transform: [{ translateX: -10 }], 
  },
  subtitle: {
    fontFamily: 'Montserrat-Regular',
    color: '#ffffff',
    fontSize: 14,
    marginTop: -4, 
    includeFontPadding: false,
  },
  formSection: {
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
    alignItems: 'center',
  },
  pageTitle: {
    fontFamily: 'Montserrat-Bold',
    color: '#ffffff',
    fontSize: 28,
    letterSpacing: 1,
    marginBottom: 16,
    marginTop: 24,
    includeFontPadding: false,
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
  inputMarginSmall: {
    marginTop: 8, 
  },
  inputMarginLarge: {
    marginTop: 24,
  },
  dateInputContainer: {
    flexDirection: 'row', 
    alignItems: 'center',
    justifyContent: 'space-between', 
  },
  dateText: {
    fontFamily: 'Montserrat-Regular',
    color: '#ffffff',
    fontSize: 16,
    includeFontPadding: false,
  },
  placeholderText: {
    color: '#83a96e', 
  },
  calendarIcon: {
    width: 18,
    height: 18,
    tintColor: '#ffffff', 
  },
  errorText: {
    marginTop: 12,
    color: '#ffe0e0',
    fontFamily: 'Montserrat-Regular',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  configText: {
    marginTop: 12,
    color: '#fff8d6',
    fontFamily: 'Montserrat-Regular',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
    paddingHorizontal: 8,
  },
  mainButtonContainer: {
    width: '100%',
    marginTop: 24, 
    maxWidth: 260, 
  },
  button: {
    width: '100%',
    backgroundColor: '#c2dc68',
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
  googleButtonContainer: {
    marginTop: 20,
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
  linksContainer: {
    marginTop: 12, 
    alignItems: 'center',
  },
  helperText: {
    fontFamily: 'Montserrat-Regular',
    color: '#3f5c2b',
    fontSize: 12,
    marginTop: 1,
    includeFontPadding: false,
  },
  linkText: {
    fontFamily: 'Montserrat-Regular', 
    textDecorationLine: 'underline',
  },
  footer: {
    alignItems: 'center',
    marginTop: 32, 
    marginBottom: 16,
  },
  footerText: {
    fontFamily: 'Montserrat-Regular', 
    textAlign: 'center',
    color: '#3f5c2b',
    fontSize: 10,
    paddingHorizontal: 40,
    includeFontPadding: false,
  },
});
