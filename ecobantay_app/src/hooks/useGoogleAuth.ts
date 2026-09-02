import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

WebBrowser.maybeCompleteAuthSession();

/** Expo Go / Store client cannot load custom native Google Sign-In. */
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const canAttemptNativeGoogle = !isExpoGo && Platform.OS !== 'web';

type NativeGoogleModule = typeof import('@react-native-google-signin/google-signin');

function tryLoadNativeGoogle(): NativeGoogleModule | null {
  if (!canAttemptNativeGoogle) return null;
  try {
    // Lazy require so Expo Go never evaluates the TurboModule.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-google-signin/google-signin') as NativeGoogleModule;
  } catch (error) {
    console.warn('Native Google Sign-In unavailable; using browser auth fallback.', error);
    return null;
  }
}

/**
 * Purpose: Provides Google ID tokens for Firebase login/signup.
 * How it works: prefers native Google Sign-In in APK builds; falls back to AuthSession when unavailable.
 * Technologies Used: @react-native-google-signin/google-signin, Expo AuthSession, Expo Constants.
 * Why this implementation: Expo Go and older APKs must not crash when the native module is missing.
 */
export function useGoogleAuth() {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const [nativeReady, setNativeReady] = useState(false);

  useEffect(() => {
    if (!webClientId) {
      console.warn(
        'Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID. Google sign-in will not work until it is configured.',
      );
      return;
    }

    const native = tryLoadNativeGoogle();
    if (!native) {
      setNativeReady(false);
      return;
    }

    try {
      native.GoogleSignin.configure({
        webClientId,
        offlineAccess: false,
      });
      setNativeReady(true);
    } catch (error) {
      console.warn('GoogleSignin.configure failed; browser fallback will be used.', error);
      setNativeReady(false);
    }
  }, [webClientId]);

  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: webClientId || undefined,
    clientId: webClientId || 'missing-google-web-client-id.apps.googleusercontent.com',
    androidClientId: androidClientId || undefined,
    iosClientId: iosClientId || undefined,
    selectAccount: true,
  });

  /**
   * Purpose: Opens Google account picker and returns a Firebase-ready ID token.
   * How it works: native path when the module is ready; otherwise AuthSession browser flow.
   */
  const signInWithGoogle = useCallback(async (): Promise<string | null> => {
    if (!webClientId) {
      throw new Error(
        'Google Sign-In is not configured. Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to your .env file.',
      );
    }

    if (nativeReady) {
      const native = tryLoadNativeGoogle();
      if (native) {
        const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = native;
        try {
          await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
          const result = await GoogleSignin.signIn();
          if (!isSuccessResponse(result)) {
            return null;
          }
          const idToken = result.data.idToken;
          if (!idToken) {
            throw new Error('Google did not return an ID token. Check Firebase Google Sign-In setup.');
          }
          return idToken;
        } catch (error: unknown) {
          if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
            return null;
          }
          if (isErrorWithCode(error) && error.code === statusCodes.IN_PROGRESS) {
            return null;
          }
          if (isErrorWithCode(error) && error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
            throw new Error('Google Play Services is required for Google Sign-In on this device.');
          }
          // Fall through to AuthSession instead of crashing the screen.
          console.warn('Native Google Sign-In failed; trying browser fallback.', error);
        }
      }
    }

    const result = await promptAsync();
    if (result.type === 'dismiss' || result.type === 'cancel') {
      return null;
    }
    if (result.type !== 'success') {
      throw new Error('Google sign-in failed. Please try again.');
    }
    const idToken =
      result.params.id_token ??
      (result as { authentication?: { idToken?: string } }).authentication?.idToken;
    if (!idToken) {
      throw new Error(
        'Google sign-in needs a rebuilt EcoBantay APK for reliable login. Email/password still works.',
      );
    }
    return idToken;
  }, [nativeReady, promptAsync, webClientId]);

  const canPrompt = useMemo(() => {
    if (!webClientId) return false;
    if (nativeReady) return true;
    return Boolean(request);
  }, [nativeReady, request, webClientId]);

  return {
    request: canPrompt ? request ?? ({ url: 'native-google' } as NonNullable<typeof request>) : null,
    signInWithGoogle,
    isGoogleConfigured: Boolean(webClientId),
    usesNativeGoogleSignIn: nativeReady,
  };
}
