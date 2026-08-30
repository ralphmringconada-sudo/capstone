import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import Svg, { Polygon } from "react-native-svg";
import {
  AlertCircle,
  ArrowLeft,
  CircleCheckBig,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react-native";
import {
  useFonts,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  Montserrat_900Black,
} from "@expo-google-fonts/montserrat";
import {
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";

import { auth } from "@/config/firebase";

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ResetPasswordScreen() {
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{
    mode?: string | string[];
    oobCode?: string | string[];
  }>();

  const mode = readParam(params.mode);
  const oobCode = readParam(params.oobCode);

  const [accountEmail, setAccountEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isVerifying, setIsVerifying] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState("");

  const [fontsLoaded] = useFonts({
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
    Montserrat_900Black,
  });

  useEffect(() => {
    let active = true;

    const verifyLink = async () => {
      setIsVerifying(true);
      setError("");

      if (mode !== "resetPassword" || !oobCode) {
        if (active) {
          setError(
            "This password reset link is incomplete or invalid. Please request a new reset email.",
          );
          setIsVerifying(false);
        }
        return;
      }

      try {
        const email = await verifyPasswordResetCode(auth, oobCode);

        if (active) {
          setAccountEmail(email);
        }
      } catch {
        if (active) {
          setError(
            "This password reset link is invalid or has expired. Please request a new reset email.",
          );
        }
      } finally {
        if (active) {
          setIsVerifying(false);
        }
      }
    };

    void verifyLink();

    return () => {
      active = false;
    };
  }, [mode, oobCode]);

  const handleResetPassword = async () => {
    if (!oobCode || isSaving) return;

    setError("");

    if (!newPassword) {
      setError("Enter your new password.");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must contain at least 6 characters.");
      return;
    }

    if (!confirmPassword) {
      setError("Confirm your new password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setIsSaving(true);

    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setIsComplete(true);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      const code = String(err?.code || "");

      if (
        code.includes("expired-action-code") ||
        code.includes("invalid-action-code")
      ) {
        setError(
          "This password reset link is no longer valid. Please request a new reset email.",
        );
      } else if (code.includes("weak-password")) {
        setError("Please choose a stronger password.");
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to reset your password. Please try again.",
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!fontsLoaded) {
    return (
      <View style={styles.loadingPage}>
        <ActivityIndicator size="large" color="#34733B" />
      </View>
    );
  }

  const compact = width < 900;

  return (
    <View style={styles.container}>
      {!compact ? (
        <Svg height="100%" width="42%" style={styles.leftShapes}>
          <Polygon points="0,0 190,0 90,1000 0,1000" fill="#9BCB2E" />
          <Polygon points="300,560 570,1000 90,1000" fill="#679B16" />
          <Polygon points="190,0 440,0 270,1000 90,1000" fill="#34733B" />
        </Svg>
      ) : null}

      <View
        style={[
          styles.pageContent,
          compact && styles.pageContentCompact,
        ]}
      >
        <View style={styles.brandWrap}>
          <Image
            source={require("../../assets/images/ecobantay-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.card}>
          <Pressable
            onPress={() => router.replace("/")}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.pressed,
            ]}
          >
            <ArrowLeft size={18} color="#3F5741" strokeWidth={2.3} />
            <Text style={styles.backText}>Back to login</Text>
          </Pressable>

          {isVerifying ? (
            <View style={styles.stateContent}>
              <View style={styles.iconCircle}>
                <ShieldCheck
                  size={40}
                  color="#34733B"
                  strokeWidth={2.1}
                />
              </View>

              <Text style={styles.title}>VERIFYING LINK</Text>

              <Text style={styles.subtitle}>
                Checking that your password reset request is secure and still valid.
              </Text>

              <ActivityIndicator
                size="large"
                color="#34733B"
                style={styles.verifyingSpinner}
              />
            </View>
          ) : isComplete ? (
            <View style={styles.stateContent}>
              <View style={styles.successIconCircle}>
                <CircleCheckBig
                  size={48}
                  color="#2F8F3E"
                  strokeWidth={2}
                />
              </View>

              <Text style={styles.title}>PASSWORD UPDATED</Text>

              <Text style={styles.subtitle}>
                Your administrator password has been changed successfully.
                You can now sign in using your new password.
              </Text>

              {accountEmail ? (
                <View style={styles.emailChip}>
                  <Text style={styles.emailChipLabel}>ACCOUNT</Text>
                  <Text numberOfLines={1} style={styles.emailChipText}>
                    {accountEmail}
                  </Text>
                </View>
              ) : null}

              <Pressable
                onPress={() => router.replace("/")}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>RETURN TO LOGIN</Text>
              </Pressable>
            </View>
          ) : error && !accountEmail ? (
            <View style={styles.stateContent}>
              <View style={styles.errorIconCircle}>
                <AlertCircle
                  size={45}
                  color="#A93131"
                  strokeWidth={2}
                />
              </View>

              <Text style={styles.errorTitle}>RESET LINK UNAVAILABLE</Text>

              <Text style={styles.subtitle}>{error}</Text>

              <Pressable
                onPress={() => router.replace("/")}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                <Text style={styles.primaryButtonText}>BACK TO LOGIN</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.header}>
                <View style={styles.iconCircle}>
                  <LockKeyhole
                    size={38}
                    color="#34733B"
                    strokeWidth={2.1}
                  />
                </View>

                <Text style={styles.title}>CREATE NEW PASSWORD</Text>

                <Text style={styles.subtitle}>
                  Choose a new password for your EcoBantay administrator account.
                </Text>
              </View>

              <View style={styles.accountBox}>
                <Text style={styles.accountLabel}>RESETTING PASSWORD FOR</Text>
                <Text numberOfLines={1} style={styles.accountEmail}>
                  {accountEmail}
                </Text>
              </View>

              <View style={styles.form}>
                <Text style={styles.inputLabel}>NEW PASSWORD</Text>

                <View
                  style={[
                    styles.inputBox,
                    error && !newPassword ? styles.inputBoxError : null,
                  ]}
                >
                  <LockKeyhole
                    size={20}
                    color="#5F6B60"
                    strokeWidth={2}
                  />

                  <TextInput
                    value={newPassword}
                    onChangeText={(value) => {
                      setNewPassword(value);
                      if (error) setError("");
                    }}
                    placeholder="Enter new password"
                    placeholderTextColor="#8B968C"
                    secureTextEntry={!showNewPassword}
                    editable={!isSaving}
                    style={styles.input}
                  />

                  <Pressable
                    onPress={() => setShowNewPassword((current) => !current)}
                    disabled={isSaving}
                    hitSlop={10}
                  >
                    {showNewPassword ? (
                      <EyeOff size={20} color="#536255" />
                    ) : (
                      <Eye size={20} color="#536255" />
                    )}
                  </Pressable>
                </View>

                <Text style={[styles.inputLabel, styles.confirmLabel]}>
                  CONFIRM NEW PASSWORD
                </Text>

                <View style={styles.inputBox}>
                  <LockKeyhole
                    size={20}
                    color="#5F6B60"
                    strokeWidth={2}
                  />

                  <TextInput
                    value={confirmPassword}
                    onChangeText={(value) => {
                      setConfirmPassword(value);
                      if (error) setError("");
                    }}
                    placeholder="Re-enter new password"
                    placeholderTextColor="#8B968C"
                    secureTextEntry={!showConfirmPassword}
                    editable={!isSaving}
                    style={styles.input}
                    onSubmitEditing={() => void handleResetPassword()}
                  />

                  <Pressable
                    onPress={() =>
                      setShowConfirmPassword((current) => !current)
                    }
                    disabled={isSaving}
                    hitSlop={10}
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={20} color="#536255" />
                    ) : (
                      <Eye size={20} color="#536255" />
                    )}
                  </Pressable>
                </View>

                <View style={styles.passwordHint}>
                  <ShieldCheck
                    size={17}
                    color="#34733B"
                    strokeWidth={2}
                  />
                  <Text style={styles.passwordHintText}>
                    Use at least 6 characters. For better security, combine
                    uppercase and lowercase letters, numbers, and symbols.
                  </Text>
                </View>

                {error ? (
                  <View style={styles.errorBox}>
                    <AlertCircle
                      size={17}
                      color="#A93131"
                      strokeWidth={2.2}
                    />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Pressable
                  onPress={() => void handleResetPassword()}
                  disabled={isSaving}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && !isSaving && styles.primaryButtonPressed,
                    isSaving && styles.primaryButtonDisabled,
                  ]}
                >
                  {isSaving ? (
                    <>
                      <ActivityIndicator color="#FFFFFF" size="small" />
                      <Text style={styles.primaryButtonText}>SAVING...</Text>
                    </>
                  ) : (
                    <>
                      <ShieldCheck
                        size={18}
                        color="#FFFFFF"
                        strokeWidth={2.2}
                      />
                      <Text style={styles.primaryButtonText}>
                        UPDATE PASSWORD
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingPage: {
    flex: 1,
    backgroundColor: "#E7F5BE",
    alignItems: "center",
    justifyContent: "center",
  },

  container: {
    flex: 1,
    width: "100%",
    minHeight: "100%",
    backgroundColor: "#E7F5BE",
    overflow: "hidden",
  },

  leftShapes: {
    position: "absolute",
    left: 0,
    top: 0,
  },

  pageContent: {
    flex: 1,
    width: "100%",
    minHeight: "100%",
    paddingHorizontal: 32,
    paddingVertical: 28,
    alignItems: "flex-end",
    justifyContent: "center",
  },

  pageContentCompact: {
    alignItems: "center",
  },

  brandWrap: {
    position: "absolute",
    top: 18,
    right: 38,
  },

  logo: {
    width: 220,
    height: 92,
  },

  card: {
    width: "92%",
    maxWidth: 520,
    minHeight: 540,
    marginRight: "8%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D7E6D3",
    paddingHorizontal: 34,
    paddingTop: 28,
    paddingBottom: 32,

    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 18,
  },

  backButton: {
    alignSelf: "flex-start",
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingRight: 8,
    cursor: "pointer",
  } as any,

  backText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 12,
    color: "#3F5741",
  },

  pressed: {
    opacity: 0.65,
  },

  header: {
    alignItems: "center",
    marginTop: 8,
  },

  stateContent: {
    flex: 1,
    minHeight: 430,
    paddingTop: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#EAF5E5",
    borderWidth: 1,
    borderColor: "#CEE6C7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 17,
  },

  successIconCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: "#E8F7E5",
    borderWidth: 1,
    borderColor: "#CBE7C4",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },

  errorIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#FFF0F0",
    borderWidth: 1,
    borderColor: "#F0CCCC",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },

  title: {
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 23,
    lineHeight: 29,
    color: "#145B22",
    textAlign: "center",
    letterSpacing: 0.5,
  },

  errorTitle: {
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 21,
    lineHeight: 27,
    color: "#8E2E2E",
    textAlign: "center",
    letterSpacing: 0.4,
  },

  subtitle: {
    maxWidth: 390,
    marginTop: 9,
    fontFamily: "Montserrat_700Bold",
    fontSize: 12,
    lineHeight: 18,
    color: "#657066",
    textAlign: "center",
  },

  verifyingSpinner: {
    marginTop: 25,
  },

  accountBox: {
    marginTop: 23,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 9,
    backgroundColor: "#F2F8EF",
    borderWidth: 1,
    borderColor: "#DBEBD6",
  },

  accountLabel: {
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 9,
    color: "#6B7A6C",
    letterSpacing: 0.6,
    marginBottom: 3,
  },

  accountEmail: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 13,
    color: "#34733B",
  },

  form: {
    marginTop: 21,
  },

  inputLabel: {
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 10,
    letterSpacing: 0.55,
    color: "#334735",
    marginBottom: 7,
  },

  confirmLabel: {
    marginTop: 16,
  },

  inputBox: {
    height: 52,
    borderWidth: 1,
    borderColor: "#C8D3C6",
    borderRadius: 9,
    backgroundColor: "#FBFCFA",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  inputBoxError: {
    borderColor: "#B64646",
  },

  input: {
    flex: 1,
    height: "100%",
    color: "#263628",
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    outlineStyle: "none" as any,
  },

  passwordHint: {
    marginTop: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#F3F8F0",
    borderWidth: 1,
    borderColor: "#DCEAD7",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },

  passwordHintText: {
    flex: 1,
    color: "#627064",
    fontFamily: "Montserrat_700Bold",
    fontSize: 10,
    lineHeight: 15,
  },

  errorBox: {
    marginTop: 11,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "#FFF0F0",
    borderWidth: 1,
    borderColor: "#F0CACA",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },

  errorText: {
    flex: 1,
    color: "#963030",
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    lineHeight: 16,
  },

  primaryButton: {
    minWidth: 190,
    height: 46,
    marginTop: 22,
    alignSelf: "center",
    paddingHorizontal: 20,
    borderRadius: 9,
    backgroundColor: "#34733B",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    cursor: "pointer",
  } as any,

  primaryButtonPressed: {
    opacity: 0.82,
  },

  primaryButtonDisabled: {
    opacity: 0.65,
    cursor: "default",
  } as any,

  primaryButtonText: {
    color: "#FFFFFF",
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 12,
  },

  emailChip: {
    maxWidth: "100%",
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 9,
    backgroundColor: "#F2F8EF",
    borderWidth: 1,
    borderColor: "#DBEBD6",
    alignItems: "center",
  },

  emailChipLabel: {
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 9,
    color: "#728073",
    letterSpacing: 0.5,
  },

  emailChipText: {
    marginTop: 3,
    fontFamily: "Montserrat_700Bold",
    fontSize: 12,
    color: "#34733B",
  },
});
