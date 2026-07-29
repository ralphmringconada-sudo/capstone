import React, { useEffect, useState } from 'react';
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
import { useAuth } from '@/context/AuthContext';
import { updateUserProfile } from '@/services/authService';

/**
 * Purpose: Allows the signed-in user to update editable profile information.
 * How it works: 1) initializes fields from auth context. 2) validates input. 3) writes Firestore. 4) refreshes shared state.
 * Technologies Used: React Native, Firebase Firestore, Firebase Authentication, React Context, Expo Router.
 * Why this implementation: Refreshing context after persistence makes profile changes immediately consistent across screens.
 */
export default function EditProfileScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  /*
   * Profile form state: editable fields begin with context values, while error
   * and submission state preserve feedback throughout Firestore persistence.
   */
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [contactNumber, setContactNumber] = useState(user?.contactNumber || '');
  const [birthday, setBirthday] = useState(user?.birthday || '');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Keep form in sync when profile loads or returns from another screen.
  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName || '');
    setLastName(user.lastName || '');
    setContactNumber(user.contactNumber || '');
    setBirthday(user.birthday || '');
  }, [user]);

  const handleSave = async () => {
    setError('');
    if (!user) {
      setError('You must be signed in to update your profile.');
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setError('First name and last name are required.');
      return;
    }
    if (!contactNumber.trim()) {
      setError('Contact number is required.');
      return;
    }

    /* Async Firestore flow: prevent duplicate writes while persistence and context refresh complete. */
    setIsSubmitting(true);
    try {
      await updateUserProfile({ firstName, lastName, contactNumber, birthday });
      const refreshed = await refreshUser();
      if (!refreshed) {
        throw new Error('Changes were saved, but your profile could not be reloaded.');
      }
      Alert.alert('Saved', 'Your profile was updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      /* Error handling: retain edited values so the user can correct or retry the update. */
      setError(err instanceof Error ? err.message : 'Failed to update profile.');
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
          <Text style={styles.pageTitle}>EDIT PROFILE</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput style={[styles.input, styles.inputDisabled]} value={user?.email || ''} editable={false} />

          <Text style={styles.label}>First Name</Text>
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} editable={!isSubmitting} />

          <Text style={styles.label}>Last Name</Text>
          <TextInput style={styles.input} value={lastName} onChangeText={setLastName} editable={!isSubmitting} />

          <Text style={styles.label}>Contact Number</Text>
          <TextInput
            style={styles.input}
            value={contactNumber}
            onChangeText={setContactNumber}
            keyboardType="phone-pad"
            editable={!isSubmitting}
          />

          <Text style={styles.label}>Birthday</Text>
          <TextInput
            style={styles.input}
            value={birthday}
            onChangeText={setBirthday}
            placeholder="e.g. January 1, 2000"
            placeholderTextColor="#a0a0a0"
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
              {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>SAVE CHANGES</Text>}
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
  inputDisabled: {
    backgroundColor: '#f5f5f5',
    color: '#777',
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
});
