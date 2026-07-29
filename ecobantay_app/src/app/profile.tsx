import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Image,
  ScrollView,
  Platform,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Shadow } from 'react-native-shadow-2';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { deleteUserAccount } from '@/services/authService';
import { fetchUserReports } from '@/services/reportService';

/**
 * Purpose: Displays the signed-in user's profile, activity count, and account controls.
 * How it works: 1) reads auth context. 2) loads report totals. 3) supports edits, logout, and verified deletion.
 * Technologies Used: React Native, Expo Router, Firebase Authentication, Firebase Firestore, React Context.
 * Why this implementation: Related identity and account-management workflows are consolidated in one protected screen.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, refreshUser } = useAuth();
  /*
   * Profile workflow state: reportsMade summarizes Firestore activity, while
   * modal, password, and deletion flags coordinate provider-sensitive account removal.
   */
  const [reportsMade, setReportsMade] = useState(0);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshUser().catch(() => undefined);
    }, [refreshUser]),
  );

  /* Firestore read: refresh the user's submitted-report count whenever the active UID changes. */
  useEffect(() => {
    if (!user?.uid) return;
    fetchUserReports(user.uid)
      .then((reports) => setReportsMade(reports.length))
      .catch(() => setReportsMade(0));
  }, [user?.uid]);

  const userData = {
    name: user ? `${user.firstName} ${user.lastName}`.trim() || 'User' : 'User',
    birthday: user?.birthday || 'Not set',
    email: user?.email || '',
    contact: user?.contactNumber || 'Not set',
  };

  /**
   * Purpose: Signs out the current user and returns to the login screen.
   * How it works: 1) delegates Firebase logout to context. 2) replaces the protected route.
   * Technologies Used: Firebase Authentication, React Context, Expo Router.
   * Why this implementation: Route replacement prevents navigation back into a protected session.
   */
  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  /**
   * Purpose: Executes permanent account deletion after any required verification.
   * How it works: 1) selects provider-specific credentials. 2) deletes Firebase records. 3) clears session. 4) navigates.
   * Technologies Used: Firebase Authentication, Firebase Firestore, React state, Expo Router.
   * Why this implementation: Sensitive deletion coordinates identity, profile, and local session cleanup.
   */
  const confirmDeleteAccount = async () => {
    if (user?.authProvider === 'email' && !deletePassword.trim()) {
      Alert.alert('Password required', 'Enter your password to confirm account deletion.');
      return;
    }

    setIsDeleting(true);
    /* Async deletion flow: lock confirmation controls until all Firebase cleanup completes. */
    try {
      await deleteUserAccount(user?.authProvider === 'email' ? deletePassword : undefined);
      setDeleteModalVisible(false);
      await logout();
      router.replace('/login');
      Alert.alert('Account Deleted', 'Your account has been permanently deleted.');
    } catch (err) {
      /* Error handling: preserve the signed-in state when deletion or reauthentication fails. */
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete account.');
    } finally {
      setIsDeleting(false);
    }
  };

  /**
   * Purpose: Confirms destructive intent before starting account deletion.
   * How it works: 1) shows a warning. 2) requests password confirmation for email users. 3) continues Google deletion directly.
   * Technologies Used: React Native Alert, React state, Firebase provider metadata.
   * Why this implementation: Provider-aware confirmation balances explicit consent with Firebase reauthentication requirements.
   */
  const handleDeletePress = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            if (user?.authProvider === 'email') {
              setDeleteModalVisible(true);
            } else {
              confirmDeleteAccount();
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#9FC37F" />
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.topHeader}>
        <TouchableOpacity onPress={() => router.replace('/home')} style={styles.backButton}>
          <Image
            source={require('@/assets/images/back_arrow.png')}
            style={styles.backArrowImage}
            resizeMode="contain"
          />
        </TouchableOpacity>
        <Image
          source={require('@/assets/images/Ecobantay_Logo_2.png')}
          style={styles.brandImage}
          resizeMode="contain"
        />
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>USER PROFILE</Text>

        <Shadow distance={2} startColor={'rgba(0, 0, 0, 0.05)'} offset={[0, 2]} style={styles.cardShadowWrapper}>
          <View style={styles.card}>
            <Text style={styles.infoText}>Name: {userData.name}</Text>
            <Text style={styles.infoText}>Birth day: {userData.birthday}</Text>
            <View style={styles.divider} />
            <Text style={styles.infoText}>Email: {userData.email}</Text>
            <Text style={styles.infoText}>Contact: {userData.contact}</Text>

            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.actionButton}
              onPress={() => router.navigate('/edit-profile')}
            >
              <Text style={styles.actionButtonText}>Change Information</Text>
            </TouchableOpacity>
          </View>
        </Shadow>

        <Shadow distance={2} startColor={'rgba(0, 0, 0, 0.05)'} offset={[0, 2]} style={styles.cardShadowWrapper}>
          <View style={styles.card}>
            {user?.authProvider === 'google' ? (
              <>
                <Text style={styles.infoText}>Password: Managed by Google</Text>
                <Text style={styles.helperText}>
                  Google sign-in accounts change passwords through Google Account settings.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.infoText}>Password: ************</Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.actionButton, styles.marginTop]}
                  onPress={() => router.navigate('/change-password')}
                >
                  <Text style={styles.actionButtonText}>Change Password</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </Shadow>

        <View style={styles.statsContainer}>
          <View style={styles.statsRow}>
            <View style={[styles.statBox, styles.statBoxTan]}>
              <View style={styles.statHeader}>
                <View style={[styles.statIconCircle, { backgroundColor: '#2ecc71' }]}>
                  <Image source={require('@/assets/images/report_icon.png')} style={styles.statIcon} />
                </View>
                <Text style={styles.statLabel}>Reports Made</Text>
              </View>
              <Text style={styles.statNumber}>{reportsMade}</Text>
            </View>

            <View style={[styles.statBox, styles.statBoxBlue]}>
              <View style={styles.statHeader}>
                <View style={[styles.statIconCircle, { backgroundColor: '#3498db' }]}>
                  <Image source={require('@/assets/images/event_icon.png')} style={styles.statIcon} />
                </View>
                <Text style={styles.statLabel}>Events Made</Text>
              </View>
              <Text style={styles.statNumber}>0</Text>
            </View>
          </View>

          <View style={[styles.statBoxFull, styles.statBoxLightBlue]}>
            <Text style={styles.statLabel}>Events Participated</Text>
            <Text style={styles.statNumber}>0</Text>
          </View>
        </View>

        <Shadow distance={2} startColor={'rgba(58, 58, 58, 0.25)'} offset={[0, 2]} style={styles.cardShadowWrapper}>
          <TouchableOpacity activeOpacity={0.8} style={styles.deleteButton} onPress={handleDeletePress}>
            <Text style={styles.deleteButtonText}>DELETE ACCOUNT</Text>
          </TouchableOpacity>
        </Shadow>

        <View style={{ height: 40 }} />

        <Shadow distance={2} startColor={'rgba(58, 58, 58, 0.25)'} offset={[0, 2]} style={styles.cardShadowWrapper}>
          <TouchableOpacity activeOpacity={0.8} style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutButtonText}>LOG OUT</Text>
          </TouchableOpacity>
        </Shadow>
      </ScrollView>

      <Modal visible={deleteModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm Password</Text>
            <Text style={styles.modalText}>Enter your password to delete this account.</Text>
            <TextInput
              style={styles.modalInput}
              secureTextEntry
              value={deletePassword}
              onChangeText={setDeletePassword}
              placeholder="Password"
              placeholderTextColor="#999"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setDeleteModalVisible(false);
                  setDeletePassword('');
                }}
                disabled={isDeleting}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirm}
                onPress={confirmDeleteAccount}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  pageTitle: {
    fontFamily: 'Montserrat-Bold',
    color: '#000000',
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 1,
    includeFontPadding: false,
  },
  cardShadowWrapper: { width: '100%', marginBottom: 20 },
  card: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  infoText: {
    fontFamily: 'Montserrat-Semi-Bold',
    fontSize: 14,
    color: '#333333',
    marginBottom: 8,
    includeFontPadding: false,
  },
  helperText: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 12,
    color: '#666666',
    lineHeight: 18,
    includeFontPadding: false,
  },
  divider: { height: 1, backgroundColor: '#e0e0e0', marginVertical: 12 },
  actionButton: {
    backgroundColor: '#3B703C',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  marginTop: { marginTop: 16 },
  actionButtonText: {
    fontFamily: 'Montserrat-Bold',
    color: '#ffffff',
    fontSize: 14,
    includeFontPadding: false,
  },
  statsContainer: { marginBottom: 24 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  statBox: {
    width: '48%',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  statBoxFull: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  statBoxTan: { backgroundColor: '#f4f1e1' },
  statBoxBlue: { backgroundColor: '#e6f2ff' },
  statBoxLightBlue: { backgroundColor: '#d9f0ff' },
  statHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  statIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  statIcon: { width: 16, height: 16, tintColor: '#ffffff' },
  statLabel: { fontFamily: 'Montserrat-Semi-Bold', fontSize: 12, color: '#000000', includeFontPadding: false },
  statNumber: { fontFamily: 'Montserrat-Bold', fontSize: 24, color: '#000000', includeFontPadding: false },
  deleteButton: {
    backgroundColor: '#e74c3c',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontFamily: 'Montserrat-Bold',
    color: '#ffffff',
    fontSize: 16,
    letterSpacing: 1,
    includeFontPadding: false,
  },
  logoutButton: {
    backgroundColor: '#3B703C',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutButtonText: {
    fontFamily: 'Montserrat-Bold',
    color: '#ffffff',
    fontSize: 16,
    letterSpacing: 1,
    includeFontPadding: false,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { width: '100%', backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontFamily: 'Montserrat-Bold', fontSize: 18, marginBottom: 8 },
  modalText: { fontFamily: 'Montserrat-Regular', fontSize: 14, color: '#555', marginBottom: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  modalCancel: { paddingHorizontal: 16, paddingVertical: 10 },
  modalCancelText: { fontFamily: 'Montserrat-Semi-Bold', color: '#666' },
  modalConfirm: {
    backgroundColor: '#e74c3c',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  modalConfirmText: { fontFamily: 'Montserrat-Bold', color: '#fff' },
});
