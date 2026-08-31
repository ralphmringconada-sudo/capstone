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
  Switch,
  ScrollView,
} from "react-native";
import Constants from "expo-constants";
import AdminLayout from "../components/AdminLayout";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { changeAdminPassword, updateAdminProfileInfo } from "@/services/adminDataService";
import type { AdminNotificationPrefs } from "@/types/admin";

const DEFAULT_PREFS: AdminNotificationPrefs = {
  reportUpdates: true,
  eventUpdates: true,
  approvalUpdates: true,
  userActivity: true,
};

export default function SettingsScreen() {
  const { width, height } = useWindowDimensions();
  const s = Math.min(width / 1920, height / 1080);
  const { admin, refreshAdmin } = useAdminAuth();

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
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefs, setPrefs] = useState<AdminNotificationPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    if (!admin) return;
    setFullName(admin.fullName || "");
    setContactNumber(admin.contactNumber || "");
    setUsername(admin.username || "");
    setPrefs({ ...DEFAULT_PREFS, ...(admin.notificationPrefs || {}) });
  }, [admin]);

  const handleSaveProfile = async () => {
    if (!admin) return;
    setProfileError("");
    if (!fullName.trim()) {
      setProfileError("Full name is required.");
      return;
    }

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
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordError("");
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

    setSavingPassword(true);
    try {
      await changeAdminPassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("Password Updated", "Your password was changed successfully.");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSavePrefs = async () => {
    if (!admin) return;
    setSavingPrefs(true);
    try {
      await updateAdminProfileInfo(admin.uid, { notificationPrefs: prefs }, admin);
      await refreshAdmin();
      Alert.alert("Saved", "Notification settings updated.");
    } catch (err) {
      Alert.alert(
        "Save failed",
        err instanceof Error ? err.message : "Could not save notification settings.",
      );
    } finally {
      setSavingPrefs(false);
    }
  };

  const togglePref = (key: keyof AdminNotificationPrefs) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <AdminLayout activePage="Settings">
      <ScrollView
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
          Manage system info, account security, and notifications
        </Text>

        <View style={[styles.grid, { marginTop: 28 * s, gap: 24 * s }]}>
          <View style={[styles.card, { padding: 20 * s }]}>
            <Text style={[styles.cardTitle, { fontSize: 22 * s }]}>System Information</Text>
            <Text style={styles.infoLine}>App: EcoBantay Admin Web</Text>
            <Text style={styles.infoLine}>
              Version: {Constants.expoConfig?.version || "1.0.0"}
            </Text>
            <Text style={styles.infoLine}>
              Environment: {Constants.executionEnvironment || "web"}
            </Text>
            <Text style={styles.infoLine}>Role: {admin?.role === "super_admin" ? "Super Admin" : "Admin"}</Text>
            <Text style={styles.infoLine}>Account status: {admin?.status || "unknown"}</Text>
            <Text style={styles.infoLine}>
              Signed in as: {admin?.email || "—"}
            </Text>
            <Text style={styles.help}>
              EcoBantay helps Valencia LGU review environmental reports and community events.
            </Text>
          </View>

          <View style={[styles.card, { padding: 20 * s }]}>
            <Text style={[styles.cardTitle, { fontSize: 22 * s }]}>Account / Security</Text>
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

            <Text style={[styles.cardTitle, { fontSize: 18 * s, marginTop: 20 }]}>Change Password</Text>
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

        <View style={[styles.card, { padding: 20 * s, marginTop: 24 * s, marginBottom: 40 * s }]}>
          <Text style={[styles.cardTitle, { fontSize: 22 * s }]}>Notification Settings</Text>
          <Text style={styles.help}>
            Choose which admin inbox alerts you want to keep enabled for this account.
          </Text>

          {(
            [
              ["reportUpdates", "Report Notifications"],
              ["eventUpdates", "Event Notifications"],
              ["approvalUpdates", "Approval Notifications"],
              ["userActivity", "User Activity Notifications"],
            ] as const
          ).map(([key, label]) => (
            <View key={key} style={styles.prefRow}>
              <Text style={styles.prefLabel}>{label}</Text>
              <Switch value={prefs[key]} onValueChange={() => togglePref(key)} />
            </View>
          ))}

          <TouchableOpacity style={styles.button} onPress={handleSavePrefs} disabled={savingPrefs}>
            {savingPrefs ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Save Notification Settings</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </AdminLayout>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#fff" },
  pageTitle: { fontFamily: "Montserrat_700Bold", color: "#0B5A1E" },
  subtitle: { fontFamily: "Montserrat_700Bold", color: "#555", marginTop: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  card: {
    flex: 1,
    minWidth: 320,
    borderWidth: 1,
    borderColor: "#d6d6d6",
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  cardTitle: { fontFamily: "Montserrat_700Bold", color: "#111", marginBottom: 16 },
  label: { fontFamily: "Montserrat_700Bold", color: "#444", marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Montserrat_500Medium",
  },
  inputDisabled: { backgroundColor: "#f3f3f3", color: "#777" },
  button: {
    marginTop: 16,
    backgroundColor: "#168A18",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontFamily: "Montserrat_700Bold" },
  error: { color: "#b42318", marginTop: 8, fontFamily: "Montserrat_500Medium" },
  infoLine: { fontFamily: "Montserrat_500Medium", color: "#333", marginBottom: 8 },
  help: { fontFamily: "Montserrat_400Regular", color: "#666", marginBottom: 12 },
  prefRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  prefLabel: { fontFamily: "Montserrat_600SemiBold", color: "#222" },
});
