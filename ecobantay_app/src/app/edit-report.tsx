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
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { fetchReportById, updateReportDescription } from '@/services/reportService';

/**
 * Purpose: Allows a reporter to edit the description of an owned report.
 * How it works: 1) loads the user-scoped report. 2) populates editable state. 3) validates and writes changes.
 * Technologies Used: React Native, Expo Router, Firebase Firestore, React Context.
 * Why this implementation: Ownership checks and field-limited editing protect evidence and moderation metadata.
 */
export default function EditReportScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user } = useAuth();
  /*
   * Editing state: title provides immutable report context, description is the
   * permitted edit, and loading/saving flags separate read and write progress.
   */
  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  /*
   * Firestore read lifecycle: load only when route ID and authenticated UID exist,
   * then populate the form or return safely when the owned report is unavailable.
   */
  useEffect(() => {
    if (!id || !user?.uid) {
      setIsLoading(false);
      return;
    }

    /* Async Firestore flow: resolve the report before releasing the screen's loading state. */
    (async () => {
      try {
        const report = await fetchReportById(String(id), user.uid);
        if (!report) {
          Alert.alert('Not found', 'This report could not be loaded.');
          router.back();
          return;
        }
        setTitle(report.title);
        setDescription(report.description);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id, user?.uid, router]);

  /**
   * Purpose: Validates and persists an edited report description.
   * How it works: 1) verifies route/user and required text. 2) writes Firestore. 3) returns to report details.
   * Technologies Used: Firebase Firestore, React state, React Native Alert, Expo Router.
   * Why this implementation: The save path rechecks ownership in the service before applying the limited update.
   */
  const handleSave = async () => {
    if (!id || !user?.uid) return;
    if (!description.trim()) {
      Alert.alert('Missing description', 'Please enter a description.');
      return;
    }

    /* Async Firestore flow: disable duplicate saves until the update operation settles. */
    setIsSaving(true);
    try {
      await updateReportDescription(String(id), user.uid, description);
      Alert.alert('Saved', 'Report description updated.', [
        {
          text: 'OK',
          onPress: () =>
            router.replace({
              pathname: '/view-report',
              params: { id: String(id) },
            }),
        },
      ]);
    } catch (err) {
      /* Error handling: keep the edited description available for correction or retry. */
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update report.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#3f5c2b" />
        </View>
      </SafeAreaView>
    );
  }

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
          <Text style={styles.pageTitle}>EDIT REPORT</Text>
          <Text style={styles.reportTitle}>{title}</Text>

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={styles.textArea}
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
            editable={!isSaving}
          />

          <Shadow distance={2} startColor={'rgba(0, 0, 0, 0.15)'} offset={[0, 2]} style={{ width: '100%' }}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>SAVE CHANGES</Text>
              )}
            </TouchableOpacity>
          </Shadow>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  scrollContent: { padding: 20, paddingBottom: 40 },
  pageTitle: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 22,
    textAlign: 'center',
    marginBottom: 12,
  },
  reportTitle: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 16,
    color: '#3f5c2b',
    marginBottom: 20,
    textAlign: 'center',
  },
  label: { fontFamily: 'Montserrat-Bold', fontSize: 14, marginBottom: 8 },
  textArea: {
    minHeight: 160,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    fontFamily: 'Montserrat-Regular',
    fontSize: 14,
    marginBottom: 24,
    color: '#333',
  },
  saveButton: {
    backgroundColor: '#3B703C',
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: '#fff', fontFamily: 'Montserrat-Bold', fontSize: 16 },
});
