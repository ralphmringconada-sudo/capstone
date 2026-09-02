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
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
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
  const { request, signInWithGoogle, isGoogleConfigured } = useGoogleAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthday, setBirthday] = useState<Date | null>(null);
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const submissionLockRef = useRef(false);

  const formatBirthdayDisplay = (date: Date): string =>
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const handleSignUp = async () => {
    if (submissionLockRef.current) return;
    setError('');

    if (!isFirebaseConfigured) {
      setError(FIREBASE_SETUP_MESSAGE);
      return;
    }

    if (!birthday) {
      setError('Please select your birthday.');
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
        pathname: '/verify-email' as '/login',
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
      const idToken = await signInWithGoogle();
      if (!idToken) {
        return;
      }
      await registerGoogle(idToken);
      router.replace('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign up with Google.');
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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

          <TouchableOpacity
            style={[styles.input, styles.groupBottom, styles.birthdayInput]}
            activeOpacity={0.8}
            onPress={() => !isBusy && setShowBirthdayPicker(true)}
            disabled={isBusy}
          >
            <Text style={birthday ? styles.birthdayText : styles.birthdayPlaceholder}>
              {birthday ? formatBirthdayDisplay(birthday) : 'Birthday'}
            </Text>
            <Image
              source={require('@/assets/images/calendar_icon.png')}
              style={styles.birthdayIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>

          {showBirthdayPicker ? (
            <DateTimePicker
              value={birthday || new Date(2000, 0, 1)}
              mode="date"
              maximumDate={new Date()}
              onChange={(_, date) => {
                setShowBirthdayPicker(Platform.OS === 'ios');
                if (date) setBirthday(date);
              }}
            />
          ) : null}

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
  birthdayInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  birthdayText: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 16,
    color: '#ffffff',
  },
  birthdayPlaceholder: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 16,
    color: '#83a96e',
  },
  birthdayIcon: {
    width: 20,
    height: 20,
    tintColor: '#c2dc68',
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