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
        style={styles.page}
        contentContainerStyle={{
          paddingHorizontal: width * 0.025,
          paddingTop: height * 0.035,
          paddingBottom: 40 * s,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.pageTitle, { fontSize: 42 * s }]}>SETTINGS</Text>
        <Text style={[styles.subtitle, { fontSize: 18 * s }]}>
          Manage system info, account security, and notifications
        </Text>

        <View style={[styles.grid, { marginTop: 28 * s, gap: 22 * s }]}>
          <View style={styles.leftColumn}>
            <View style={[styles.card, { padding: 24 * s }]}>
              <Text style={[styles.cardTitle, { fontSize: 21 * s }]}>
                System Information
              </Text>

              <View style={styles.infoList}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>App</Text>
                  <Text style={styles.infoValue}>EcoBantay Admin Web</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Version</Text>
                  <Text style={styles.infoValue}>
                    {Constants.expoConfig?.version || "1.0.0"}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Environment</Text>
                  <Text style={styles.infoValue}>
                    {Constants.executionEnvironment || "web"}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Role</Text>
                  <Text style={styles.infoValue}>
                    {admin?.role === "super_admin" ? "Super Admin" : "Admin"}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Account Status</Text>
                  <Text style={styles.infoValue}>
                    {admin?.status || "unknown"}
                  </Text>
                </View>

                <View style={[styles.infoRow, styles.infoRowLast]}>
                  <Text style={styles.infoLabel}>Signed In As</Text>
                  <Text style={styles.infoValue}>
                    {admin?.email || "—"}
                  </Text>
                </View>
              </View>

              <Text style={styles.help}>
                EcoBantay helps Valencia LGU review environmental reports and community events.
              </Text>
            </View>

            <View style={[styles.card, { padding: 24 * s, marginTop: 22 * s }]}>
              <Text style={[styles.cardTitle, { fontSize: 21 * s }]}>
                Notification Settings
              </Text>

              <Text style={styles.help}>
                Choose which admin inbox alerts you want to keep enabled for this account.
              </Text>

              <View style={styles.prefList}>
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
                    <Switch
                      value={prefs[key]}
                      onValueChange={() => togglePref(key)}
                    />
                  </View>
                ))}
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.button}
                  onPress={handleSavePrefs}
                  disabled={savingPrefs}
                >
                  {savingPrefs ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>
                      Save Notification Settings
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.rightColumn}>
            <View style={[styles.card, { padding: 24 * s }]}>
              <Text style={[styles.cardTitle, { fontSize: 21 * s }]}>
                Account / Security
              </Text>

              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionTitle, { fontSize: 16 * s }]}>
                  Profile Information
                </Text>

                <View style={styles.formGrid}>
                  <View style={styles.formField}>
                    <Text style={styles.label}>Full Name</Text>
                    <TextInput
                      style={styles.input}
                      value={fullName}
                      onChangeText={setFullName}
                    />
                  </View>

                  <View style={styles.formField}>
                    <Text style={styles.label}>Username</Text>
                    <TextInput
                      style={styles.input}
                      value={username}
                      onChangeText={setUsername}
                    />
                  </View>

                  <View style={styles.formField}>
                    <Text style={styles.label}>Contact Number</Text>
                    <TextInput
                      style={styles.input}
                      value={contactNumber}
                      onChangeText={setContactNumber}
                    />
                  </View>

                  <View style={styles.formField}>
                    <Text style={styles.label}>Email</Text>
                    <TextInput
                      style={[styles.input, styles.inputDisabled]}
                      value={admin?.email || ""}
                      editable={false}
                    />
                  </View>
                </View>

                {profileError ? (
                  <Text style={styles.error}>{profileError}</Text>
                ) : null}

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={styles.button}
                    onPress={handleSaveProfile}
                    disabled={savingProfile}
                  >
                    {savingProfile ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.buttonText}>Save Profile</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.sectionDivider} />

              <View style={styles.sectionBlock}>
                <Text style={[styles.sectionTitle, { fontSize: 16 * s }]}>
                  Change Password
                </Text>

                <View style={styles.passwordFields}>
                  <View style={[styles.formField, styles.passwordField]}>
                    <Text style={[styles.label, styles.passwordLabel]}>Current Password</Text>
                    <TextInput
                      style={styles.input}
                      secureTextEntry
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                    />
                  </View>

                  <View style={[styles.formField, styles.passwordField]}>
                    <Text style={[styles.label, styles.passwordLabel]}>New Password</Text>
                    <TextInput
                      style={styles.input}
                      secureTextEntry
                      value={newPassword}
                      onChangeText={setNewPassword}
                    />
                  </View>

                  <View style={[styles.formField, styles.passwordField]}>
                    <Text style={[styles.label, styles.passwordLabel]}>Confirm New Password</Text>
                    <TextInput
                      style={styles.input}
                      secureTextEntry
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                    />
                  </View>
                </View>

                {passwordError ? (
                  <Text style={styles.error}>{passwordError}</Text>
                ) : null}

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={styles.button}
                    onPress={handleChangePassword}
                    disabled={savingPassword}
                  >
                    {savingPassword ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.buttonText}>Update Password</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </AdminLayout>
  );

}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#F7F9F7",
  },

  pageTitle: {
    fontFamily: "Montserrat_700Bold",
    color: "#0B5A1E",
  },

  subtitle: {
    fontFamily: "Montserrat_700Bold",
    color: "#5F6B61",
    marginTop: 4,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
  },

  leftColumn: {
    flex: 1,
    minWidth: 340,
  },

  rightColumn: {
    flex: 1.25,
    minWidth: 420,
  },

  card: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#E0E5E0",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 2,
  },

  cardTitle: {
    fontFamily: "Montserrat_700Bold",
    color: "#17391D",
    marginBottom: 18,
  },

  sectionTitle: {
    fontFamily: "Montserrat_700Bold",
    color: "#263528",
    marginBottom: 14,
  },

  sectionBlock: {
    width: "100%",
  },

  sectionDivider: {
    height: 1,
    backgroundColor: "#E6EAE6",
    marginVertical: 24,
  },

  infoList: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#E7EBE7",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#FBFCFB",
  },

  infoRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#ECEFEC",
  },

  infoRowLast: {
    borderBottomWidth: 0,
  },

  infoLabel: {
    flex: 0.8,
    fontFamily: "Montserrat_700Bold",
    color: "#687168",
    fontSize: 13,
  },

  infoValue: {
    flex: 1.2,
    fontFamily: "Montserrat_700Bold",
    color: "#202920",
    fontSize: 13,
    textAlign: "right",
  },

  help: {
    fontFamily: "Montserrat_700Bold",
    color: "#6A746B",
    marginTop: 14,
    marginBottom: 4,
    lineHeight: 19,
    fontSize: 13,
  },

  formGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },

  passwordFields: {
    width: "100%",
    gap: 12,
  },

  passwordField: {
    width: "100%",
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    minWidth: 0,
    marginBottom: 0,
  },

  passwordLabel: {
    marginBottom: 4,
  },

  formField: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 200,
  },

  label: {
    fontFamily: "Montserrat_700Bold",
    color: "#414A42",
    marginBottom: 7,
    fontSize: 13,
  },

  input: {
    width: "100%",
    height: 44,
    borderWidth: 1,
    borderColor: "#D1D8D1",
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    fontFamily: "Montserrat_700Bold",
    color: "#1E251F",
    fontSize: 13,
  },

  inputDisabled: {
    backgroundColor: "#F1F3F1",
    color: "#777777",
  },

  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },

  button: {
    minWidth: 180,
    minHeight: 42,
    marginTop: 18,
    backgroundColor: "#34733B",
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },

  buttonText: {
    color: "#FFFFFF",
    fontFamily: "Montserrat_700Bold",
    fontSize: 13,
  },

  error: {
    color: "#B42318",
    marginTop: 10,
    fontFamily: "Montserrat_700Bold",
    fontSize: 12,
  },

  prefList: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#E7EBE7",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#FBFCFB",
  },

  prefRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ECEFEC",
  },

  prefLabel: {
    flex: 1,
    fontFamily: "Montserrat_700Bold",
    color: "#222B23",
    fontSize: 13,
  },
});
