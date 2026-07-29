import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  Alert,
  ActivityIndicator,
} from "react-native";
import AdminLayout from "../components/AdminLayout";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { changeAdminPassword, updateAdminProfileInfo } from "@/services/adminDataService";

/**
 * Purpose: Lets the signed-in administrator maintain profile information and credentials.
 * How it works:
 * 1. Authentication context data initializes controlled profile fields.
 * 2. Profile submissions update Firestore and refresh the shared admin identity.
 * 3. Password submissions validate input and reauthenticate through Firebase.
 * Technologies Used: React hooks, React Native Web, Firebase Authentication, Cloud Firestore, and React Context.
 * Why this implementation: Separating profile and credential workflows limits sensitive operations to their proper service.
 */
export default function SettingsScreen() {
  const { width, height } = useWindowDimensions();
  const s = Math.min(width / 1920, height / 1080);
  const { admin, refreshAdmin } = useAdminAuth();

  /*
   * Profile fields mirror the Firestore admin document; credential fields remain temporary.
   * Separate errors and saving flags let each form complete without blocking the other.
   */
  const [fullName, setFullName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileError, setProfileError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!admin) return;
    // Synchronize editable fields whenever the authenticated Firestore profile changes.
    setFullName(admin.fullName || "");
    setContactNumber(admin.contactNumber || "");
    setUsername(admin.username || "");
  }, [admin]);

  /**
   * Purpose: Validates and persists editable fields for the current administrator.
   * How it works:
   * 1. An authenticated profile and required full name are verified.
   * 2. The approved fields are written to Firestore with actor attribution.
   * 3. Shared auth state is refreshed so headers and screens show the saved values.
   * Technologies Used: React state, Cloud Firestore services, React Context, and React Native alerts.
   * Why this implementation: Refreshing the provider creates one consistent profile after the write.
   */
  const handleSaveProfile = async () => {
    // Profile writes require the active admin as both target and auditable actor.
    if (!admin) return;
    setProfileError("");
    // Prevent incomplete identity data from replacing the required display name.
    if (!fullName.trim()) {
      setProfileError("Full name is required.");
      return;
    }

    // Disable repeated writes while Firestore and context refresh operations complete.
    setSavingProfile(true);
    try {
      await updateAdminProfileInfo(
        admin.uid,
        {
          fullName: fullName.trim(),
          contactNumber: contactNumber.trim(),
          username: username.trim(),
        },
        admin,
      );
      await refreshAdmin();
      Alert.alert("Saved", "Your profile was updated.");
    // Retain edited values and expose a readable Firestore update failure.
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  /**
   * Purpose: Validates and securely changes the current administrator password.
   * How it works:
   * 1. Required, matching, and minimum-length rules are checked locally.
   * 2. Firebase reauthenticates the current password before accepting the new one.
   * 3. Sensitive fields are cleared after success and errors remain in the password form.
   * Technologies Used: React state, Firebase Authentication, and React Native alerts.
   * Why this implementation: Local validation improves feedback while Firebase reauthentication protects the account.
   */
  const handleChangePassword = async () => {
    setPasswordError("");
    // Complete local credential checks before invoking a sensitive Firebase operation.
    if (!currentPassword || !newPassword) {
      setPasswordError("Current and new password are required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }

    // Prevent concurrent password updates during reauthentication and credential replacement.
    setSavingPassword(true);
    try {
      await changeAdminPassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("Password Updated", "Your password was changed successfully.");
    // Preserve the form context so the administrator can correct authentication errors.
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <AdminLayout activePage="Settings">
      <View
        style={[
          styles.page,
          {
            paddingHorizontal: width * 0.025,
            paddingTop: height * 0.035,
          },
        ]}
      >
        <Text style={[styles.pageTitle, { fontSize: 42 * s }]}>SETTINGS</Text>
        <Text style={[styles.subtitle, { fontSize: 18 * s }]}>
          Manage your admin profile and password
        </Text>

        <View style={[styles.grid, { marginTop: 28 * s, gap: 24 * s }]}>
          <View style={[styles.card, { padding: 20 * s }]}>
            <Text style={[styles.cardTitle, { fontSize: 22 * s }]}>Edit Information</Text>
            <Text style={styles.label}>Full Name</Text>
            <TextInput style={styles.input} value={fullName} onChangeText={setFullName} />
            <Text style={styles.label}>Username</Text>
            <TextInput style={styles.input} value={username} onChangeText={setUsername} />
            <Text style={styles.label}>Contact Number</Text>
            <TextInput style={styles.input} value={contactNumber} onChangeText={setContactNumber} />
            <Text style={styles.label}>Email</Text>
            <TextInput style={[styles.input, styles.inputDisabled]} value={admin?.email || ""} editable={false} />
            {profileError ? <Text style={styles.error}>{profileError}</Text> : null}
            <TouchableOpacity style={styles.button} onPress={handleSaveProfile} disabled={savingProfile}>
              {savingProfile ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Save Profile</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={[styles.card, { padding: 20 * s }]}>
            <Text style={[styles.cardTitle, { fontSize: 22 * s }]}>Change Password</Text>
            <Text style={styles.label}>Current Password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
            />
            <Text style={styles.label}>New Password</Text>
            <TextInput style={styles.input} secureTextEntry value={newPassword} onChangeText={setNewPassword} />
            <Text style={styles.label}>Confirm New Password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            {passwordError ? <Text style={styles.error}>{passwordError}</Text> : null}
            <TouchableOpacity style={styles.button} onPress={handleChangePassword} disabled={savingPassword}>
              {savingPassword ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Update Password</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#fff" },
  pageTitle: { fontFamily: "Montserrat_700Bold", color: "#0B5A1E" },
  subtitle: { fontFamily: "Montserrat_700Bold", color: "#555", marginTop: 6 },
  grid: { flexDirection: "row" },
  card: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d6d6d6",
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  cardTitle: { fontFamily: "Montserrat_700Bold", color: "#111", marginBottom: 16 },
  label: { fontFamily: "Montserrat_700Bold", color: "#444", marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#d6d6d6",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Montserrat_700Bold",
    outlineStyle: "none" as any,
  },
  inputDisabled: { backgroundColor: "#f5f5f5", color: "#777" },
  error: { color: "#8B1E1E", fontFamily: "Montserrat_700Bold", marginTop: 10 },
  button: {
    marginTop: 18,
    backgroundColor: "#34733B",
    height: 44,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#fff", fontFamily: "Montserrat_700Bold", fontSize: 16 },
});
