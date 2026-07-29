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
import { Eye, EyeOff, Lock, User } from "lucide-react-native";
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
      setError("Email and password are required.");
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
            placeholder="Email"
            placeholderTextColor="#FFFFFF"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
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
            setForgotOpen(true);
            setForgotError("");
            setForgotSuccess("");
          }}
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

      <Modal transparent visible={forgotOpen} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <Text style={styles.modalSubtitle}>
              Enter your admin email and we will send a Firebase reset link.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Admin email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={forgotEmail}
              onChangeText={setForgotEmail}
            />
            {forgotError ? <Text style={styles.modalError}>{forgotError}</Text> : null}
            {forgotSuccess ? <Text style={styles.modalSuccess}>{forgotSuccess}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable onPress={() => setForgotOpen(false)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>Close</Text>
              </Pressable>
              <Pressable
                onPress={handleForgotPassword}
                style={styles.modalConfirm}
                disabled={isSendingReset}
              >
                {isSendingReset ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Send Link</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
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
  forgot: {
    width: 470,
    textAlign: "right",
    marginTop: -16,
    marginBottom: 28,
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
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCard: {
    width: 420,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 24,
  },
  modalTitle: {
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 22,
    color: "#005B1A",
    marginBottom: 8,
  },
  modalSubtitle: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    color: "#555",
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#d6d6d6",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: "Montserrat_700Bold",
    marginBottom: 12,
    outlineStyle: "none" as any,
  },
  modalError: {
    color: "#8B1E1E",
    fontFamily: "Montserrat_700Bold",
    marginBottom: 8,
  },
  modalSuccess: {
    color: "#168A18",
    fontFamily: "Montserrat_700Bold",
    marginBottom: 8,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 8,
  },
  modalCancel: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalCancelText: {
    fontFamily: "Montserrat_700Bold",
    color: "#666",
  },
  modalConfirm: {
    backgroundColor: "#34733B",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 110,
    alignItems: "center",
  },
  modalConfirmText: {
    color: "#fff",
    fontFamily: "Montserrat_700Bold",
  },
});
