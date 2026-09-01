import { useRef, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Polygon } from "react-native-svg";
import { CircleCheckBig, Eye, EyeOff, Lock, Mail, Send, ShieldCheck, User, X } from "lucide-react-native";
import {
  useFonts,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  Montserrat_900Black,
} from "@expo-google-fonts/montserrat";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { sendAdminPasswordReset } from "@/services/adminDataService";

/**
 * Purpose: Provides secure administrator sign-in and password recovery workflows.
 * How it works:
 * 1. Controlled fields collect credentials and validate required input.
 * 2. The auth context verifies Firebase identity and administrator authorization.
 * 3. Successful login replaces the route; failures remain visible for correction.
 * 4. A modal submits password-reset requests through Firebase Authentication.
 * Technologies Used: React hooks, React Native Web, Expo Router, Firebase Authentication, and React Context.
 * Why this implementation: One focused entry screen handles both access and recovery without exposing auth internals.
 */
export default function LoginScreen() {
  const { login } = useAdminAuth();
  /*
   * Controlled field state supports validation and submission, while progress and message
   * state prevents duplicate auth requests and communicates each async outcome.
   */
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [isSendingReset, setIsSendingReset] = useState(false);
  // Prevents two rapid clicks from starting concurrent Firebase sign-in requests before React disables the button.
  const loginLockRef = useRef(false);

  const [fontsLoaded] = useFonts({
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
    Montserrat_900Black,
  });

  if (!fontsLoaded) return null;

  /**
   * Purpose: Validates input and starts an authorized administrator session.
   * How it works:
   * 1. Required credential fields are checked before network activity.
   * 2. The auth provider performs Firebase sign-in and administrator-profile checks.
   * 3. Success replaces login with the dashboard; errors are translated for the user.
   * Technologies Used: Firebase Authentication, Cloud Firestore authorization, React state, and Expo Router.
   * Why this implementation: Central provider verification prevents navigation based on credentials alone.
   */
  const handleLogin = async () => {
    if (loginLockRef.current) return;
    setError("");
    // Stop before Firebase access when either required credential is absent.
    if (!email.trim() || !password) {
      setError("Email or username and password are required.");
      return;
    }

    // Lock repeated submissions for the full asynchronous authentication sequence.
    loginLockRef.current = true;
    setIsSubmitting(true);
    try {
      // The provider verifies both Firebase identity and the matching active admin profile.
      await login(email, password);
      router.replace("/dashboard");
    // Present actionable permission guidance while retaining normal authentication errors.
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign in.";
      if (message.toLowerCase().includes("permission")) {
        setError(
          "Missing permissions. Publish Firestore rules from EcoBantay/firestore.rules, then try again.",
        );
      } else {
        setError(message);
      }
    } finally {
      loginLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  /**
   * Purpose: Sends a password-recovery link to an administrator email address.
   * How it works:
   * 1. Previous modal feedback is cleared and email presence is validated.
   * 2. Firebase Authentication sends the configured reset email.
   * 3. Success or failure state updates the modal message.
   * Technologies Used: Firebase Authentication, React state, and asynchronous JavaScript.
   * Why this implementation: Provider-managed recovery avoids storing or transmitting replacement passwords.
   */
  const closeForgotPassword = () => {
    if (isSendingReset) return;
    setForgotOpen(false);
    setForgotError("");
    setForgotSuccess("");
  };

  const handleForgotPassword = async () => {
    setForgotError("");
    setForgotSuccess("");
    // Avoid a Firebase request that cannot identify a recovery account.
    if (!forgotEmail.trim()) {
      setForgotError("Email is required.");
      return;
    }

    // Track the async request so the modal cannot submit duplicate reset emails.
    setIsSendingReset(true);
    try {
      await sendAdminPasswordReset(forgotEmail);
      setForgotSuccess("Password reset email sent. Check your inbox.");
    // Keep recovery errors inside the modal so the login form remains intact.
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : "Failed to send reset email.");
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <View style={styles.container}>
      <Svg height="100%" width="42%" style={styles.leftShapes}>
        <Polygon points="0,0 190,0 90,1000 0,1000" fill="#9BCB2E" />
        <Polygon points="300,560 570,1000 90,1000" fill="#679B16" />
        <Polygon points="190,0 440,0 270,1000 90,1000" fill="#34733B" />
      </Svg>

      <View style={styles.content}>
        <Image
          source={require("../../assets/images/ecobantay-logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.title}>ADMIN LOG IN</Text>

        <View style={styles.inputBox}>
          <User size={32} color="#FFFFFF" />
          <TextInput
            placeholder="Email or username"
            placeholderTextColor="#FFFFFF"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="default"
            editable={!isSubmitting}
          />
        </View>

        <View style={styles.inputBox}>
          <Lock size={30} color="#FFFFFF" />
          <TextInput
            placeholder="Password"
            placeholderTextColor="#FFFFFF"
            secureTextEntry={!showPassword}
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            editable={!isSubmitting}
          />
          <Pressable onPress={() => setShowPassword((prev) => !prev)} hitSlop={10}>
            {showPassword ? <EyeOff size={28} color="#FFFFFF" /> : <Eye size={28} color="#FFFFFF" />}
          </Pressable>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          onPress={() => {
            setForgotEmail(email);
            setForgotError("");
            setForgotSuccess("");
            setForgotOpen(true);
          }}
          style={({ pressed }) => [
            styles.forgotButton,
            pressed && styles.forgotButtonPressed,
          ]}
        >
          <Text style={styles.forgot}>Forgot Password?</Text>
        </Pressable>

        <Pressable
          style={[styles.loginButton, isSubmitting && styles.loginButtonDisabled]}
          onPress={handleLogin}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.loginText}>LOGIN</Text>
          )}
        </Pressable>
      </View>

      <Modal
        transparent
        visible={forgotOpen}
        animationType="fade"
        onRequestClose={closeForgotPassword}
      >
        <Pressable style={styles.modalOverlay} onPress={closeForgotPassword}>
          <Pressable
            style={styles.modalCard}
            onPress={() => {
              // Prevent clicks inside the card from closing the modal.
            }}
          >
            <Pressable
              onPress={closeForgotPassword}
              disabled={isSendingReset}
              style={({ pressed }) => [
                styles.modalCloseButton,
                pressed && !isSendingReset && styles.modalCloseButtonPressed,
                isSendingReset && styles.modalCloseButtonDisabled,
              ]}
              hitSlop={10}
            >
              <X size={20} color="#4F5F50" strokeWidth={2.4} />
            </Pressable>

            {forgotSuccess ? (
              <View style={styles.resetSuccessContent}>
                <View style={styles.successIconCircle}>
                  <CircleCheckBig size={46} color="#2E8B3C" strokeWidth={2.1} />
                </View>

                <Text style={styles.resetSuccessTitle}>CHECK YOUR EMAIL</Text>

                <Text style={styles.resetSuccessSubtitle}>
                  We sent a password reset link to
                </Text>

                <View style={styles.sentEmailChip}>
                  <Mail size={17} color="#34733B" strokeWidth={2.2} />
                  <Text numberOfLines={1} style={styles.sentEmailText}>
                    {forgotEmail.trim()}
                  </Text>
                </View>

                <View style={styles.successInfoBox}>
                  <Text style={styles.successInfoText}>
                    Open the email and follow the secure link to create a new password.
                    If you do not see it, check your spam or junk folder.
                  </Text>
                </View>

                <Pressable
                  onPress={closeForgotPassword}
                  style={({ pressed }) => [
                    styles.doneButton,
                    pressed && styles.primaryButtonPressed,
                  ]}
                >
                  <Text style={styles.doneButtonText}>DONE</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.resetHeader}>
                  <View style={styles.resetIconCircle}>
                    <ShieldCheck size={34} color="#34733B" strokeWidth={2.15} />
                  </View>

                  <Text style={styles.modalTitle}>RESET PASSWORD</Text>

                  <Text style={styles.modalSubtitle}>
                    Enter the email connected to your administrator account.
                    We will send you a secure password reset link.
                  </Text>
                </View>

                <View style={styles.resetForm}>
                  <Text style={styles.modalInputLabel}>EMAIL ADDRESS</Text>

                  <View
                    style={[
                      styles.modalInputBox,
                      forgotError ? styles.modalInputBoxError : null,
                    ]}
                  >
                    <Mail
                      size={20}
                      color={forgotError ? "#A93131" : "#5C6B5D"}
                      strokeWidth={2.1}
                    />

                    <TextInput
                      style={styles.modalInput}
                      placeholder="admin@example.com"
                      placeholderTextColor="#8A968B"
                      autoCapitalize="none"
                      keyboardType="email-address"
                      value={forgotEmail}
                      onChangeText={(value) => {
                        setForgotEmail(value);
                        if (forgotError) setForgotError("");
                      }}
                      editable={!isSendingReset}
                      autoFocus
                    />
                  </View>

                  {forgotError ? (
                    <View style={styles.modalErrorBox}>
                      <Text style={styles.modalError}>{forgotError}</Text>
                    </View>
                  ) : null}

                  <View style={styles.resetHintBox}>
                    <Lock size={17} color="#34733B" strokeWidth={2.1} />
                    <Text style={styles.resetHintText}>
                      For security, the password itself is never shown or changed inside this page.
                    </Text>
                  </View>
                </View>

                <View style={styles.modalActions}>
                  <Pressable
                    onPress={closeForgotPassword}
                    disabled={isSendingReset}
                    style={({ pressed }) => [
                      styles.modalCancel,
                      pressed && !isSendingReset && styles.secondaryButtonPressed,
                      isSendingReset && styles.buttonDisabled,
                    ]}
                  >
                    <Text style={styles.modalCancelText}>CANCEL</Text>
                  </Pressable>

                  <Pressable
                    onPress={handleForgotPassword}
                    disabled={isSendingReset}
                    style={({ pressed }) => [
                      styles.modalConfirm,
                      pressed && !isSendingReset && styles.primaryButtonPressed,
                      isSendingReset && styles.buttonDisabled,
                    ]}
                  >
                    {isSendingReset ? (
                      <>
                        <ActivityIndicator color="#FFFFFF" size="small" />
                        <Text style={styles.modalConfirmText}>SENDING...</Text>
                      </>
                    ) : (
                      <>
                        <Send size={17} color="#FFFFFF" strokeWidth={2.3} />
                        <Text style={styles.modalConfirmText}>SEND RESET LINK</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    backgroundColor: "#E7F5BE",
    overflow: "hidden",
  },
  leftShapes: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  content: {
    position: "absolute",
    right: "12%",
    width: 800,
    alignItems: "center",
  },
  logo: {
    width: 900,
    height: 620,
    right: 50,
    bottom: 50,
    marginBottom: -270,
  },
  title: {
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 26,
    color: "#005B1A",
    marginBottom: 22,
  },
  inputBox: {
    width: 470,
    height: 68,
    backgroundColor: "#34733B",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 28,
    marginBottom: 28,
    gap: 24,
  },
  input: {
    flex: 1,
    color: "#FFFFFF",
    fontFamily: "Montserrat_700Bold",
    fontSize: 25,
    outlineStyle: "none" as any,
  },
  errorText: {
    width: 470,
    color: "#8B1E1E",
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    marginBottom: 12,
    textAlign: "center",
  },
  forgotButton: {
    width: 470,
    marginTop: -16,
    marginBottom: 28,
    alignItems: "flex-end",
  },
  forgotButtonPressed: {
    opacity: 0.65,
  },
  forgot: {
    textAlign: "right",
    fontFamily: "Montserrat_700Bold",
    color: "#005B1A",
    fontSize: 14,
  },
  loginButton: {
    backgroundColor: "#34733B",
    width: 205,
    height: 55,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginText: {
    color: "#FFFFFF",
    fontFamily: "Montserrat_700Bold",
    fontSize: 30,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 28, 16, 0.48)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modalCard: {
    width: "92%",
    maxWidth: 500,
    minHeight: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingHorizontal: 30,
    paddingTop: 30,
    paddingBottom: 28,
    position: "relative",
    borderWidth: 1,
    borderColor: "#DCE7D8",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 18,
  },
  modalCloseButton: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F1F5EF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    cursor: "pointer",
  } as any,
  modalCloseButtonPressed: {
    opacity: 0.65,
  },
  modalCloseButtonDisabled: {
    opacity: 0.4,
  },
  resetHeader: {
    alignItems: "center",
    paddingHorizontal: 12,
  },
  resetIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#EAF5E5",
    borderWidth: 1,
    borderColor: "#D2E8CB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 23,
    color: "#145B22",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  modalSubtitle: {
    marginTop: 9,
    maxWidth: 390,
    fontFamily: "Montserrat_700Bold",
    fontSize: 13,
    lineHeight: 19,
    color: "#5F6B60",
    textAlign: "center",
  },
  resetForm: {
    marginTop: 25,
  },
  modalInputLabel: {
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 11,
    color: "#344735",
    letterSpacing: 0.6,
    marginBottom: 7,
  },
  modalInputBox: {
    height: 52,
    borderWidth: 1,
    borderColor: "#C9D3C7",
    borderRadius: 9,
    backgroundColor: "#FAFCF9",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  modalInputBoxError: {
    borderColor: "#B64646",
    backgroundColor: "#FFF9F9",
  },
  modalInput: {
    flex: 1,
    height: "100%",
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: "#243225",
    outlineStyle: "none" as any,
  },
  modalErrorBox: {
    marginTop: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 7,
    backgroundColor: "#FFF0F0",
    borderWidth: 1,
    borderColor: "#F1CACA",
  },
  modalError: {
    color: "#9A2E2E",
    fontFamily: "Montserrat_700Bold",
    fontSize: 12,
    lineHeight: 17,
  },
  resetHintBox: {
    marginTop: 13,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: "#F2F8EF",
    borderWidth: 1,
    borderColor: "#DCEBD7",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
  },
  resetHintText: {
    flex: 1,
    color: "#536255",
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    lineHeight: 16,
  },
  modalActions: {
    marginTop: 24,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  modalCancel: {
    minWidth: 105,
    height: 42,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#AFC0AD",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  } as any,
  modalCancelText: {
    fontFamily: "Montserrat_800ExtraBold",
    color: "#486049",
    fontSize: 12,
  },
  modalConfirm: {
    minWidth: 165,
    height: 42,
    paddingHorizontal: 17,
    borderRadius: 8,
    backgroundColor: "#34733B",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    cursor: "pointer",
  } as any,
  modalConfirmText: {
    color: "#FFFFFF",
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 12,
  },
  primaryButtonPressed: {
    opacity: 0.82,
  },
  secondaryButtonPressed: {
    backgroundColor: "#F2F6F0",
  },
  buttonDisabled: {
    opacity: 0.62,
    cursor: "default",
  } as any,
  resetSuccessContent: {
    flex: 1,
    minHeight: 360,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingTop: 16,
  },
  successIconCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: "#EAF7E7",
    borderWidth: 1,
    borderColor: "#CEE7C8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  resetSuccessTitle: {
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 23,
    color: "#145B22",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  resetSuccessSubtitle: {
    marginTop: 9,
    fontFamily: "Montserrat_700Bold",
    fontSize: 13,
    color: "#5D685E",
    textAlign: "center",
  },
  sentEmailChip: {
    maxWidth: "100%",
    minHeight: 42,
    marginTop: 13,
    paddingHorizontal: 14,
    borderRadius: 21,
    backgroundColor: "#F0F7ED",
    borderWidth: 1,
    borderColor: "#D8E9D3",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sentEmailText: {
    flexShrink: 1,
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 12,
    color: "#34733B",
  },
  successInfoBox: {
    width: "100%",
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 9,
    backgroundColor: "#F8FAF7",
    borderWidth: 1,
    borderColor: "#E0E7DD",
  },
  successInfoText: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    lineHeight: 17,
    color: "#657066",
    textAlign: "center",
  },
  doneButton: {
    minWidth: 145,
    height: 43,
    marginTop: 22,
    borderRadius: 8,
    backgroundColor: "#34733B",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  } as any,
  doneButtonText: {
    color: "#FFFFFF",
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 12,
  },
});
