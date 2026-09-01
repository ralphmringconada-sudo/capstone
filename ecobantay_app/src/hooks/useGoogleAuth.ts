import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

WebBrowser.maybeCompleteAuthSession();

const isExpoGo = Constants.appOwnership === 'expo';
const canUseNativeGoogle = !isExpoGo && Platform.OS !== 'web';

type NativeGoogleModule = typeof import('@react-native-google-signin/google-signin');

function loadNativeGoogle(): NativeGoogleModule {
  // Lazy require so Expo Go never loads the TurboModule (which would crash).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-google-signin/google-signin');
}

/**
 * Purpose: Provides Google ID tokens for Firebase login/signup.
 * How it works: uses native Google Sign-In in APK/dev builds; falls back to AuthSession in Expo Go.
 * Technologies Used: @react-native-google-signin/google-signin, Expo AuthSession, Expo Constants.
 * Why this implementation: Expo Go cannot load native Google modules; production builds need SHA-1 + webClientId.
 */
export function useGoogleAuth() {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const [nativeReady, setNativeReady] = useState(canUseNativeGoogle && Boolean(webClientId));

  useEffect(() => {
    if (!webClientId) {
      console.warn(
        'Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID. Google sign-in will not work until it is configured.',
      );
      return;
    }

    if (!canUseNativeGoogle) return;

    try {
      const { GoogleSignin } = loadNativeGoogle();
      GoogleSignin.configure({
        webClientId,
        offlineAccess: false,
      });
      setNativeReady(true);
    } catch (error) {
      console.warn('GoogleSignin.configure failed', error);
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
   * How it works: native path on Android builds; AuthSession browser path inside Expo Go.
   */
  const signInWithGoogle = useCallback(async (): Promise<string | null> => {
    if (!webClientId) {
      throw new Error(
        'Google Sign-In is not configured. Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to your .env file.',
      );
    }

    if (canUseNativeGoogle) {
      const {
        GoogleSignin,
        isErrorWithCode,
        isSuccessResponse,
        statusCodes,
      } = loadNativeGoogle();

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
        throw error instanceof Error
          ? error
          : new Error('Unable to complete Google Sign-In.');
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
        'Google sign-in needs a rebuilt EcoBantay APK (Expo Go is unreliable for Google). Install the latest preview build.',
      );
    }
    return idToken;
  }, [promptAsync, webClientId]);

  const canPrompt = useMemo(() => {
    if (!webClientId) return false;
    if (canUseNativeGoogle) return nativeReady;
    return Boolean(request);
  }, [nativeReady, request, webClientId]);

  return {
    // Truthy stub keeps the Google button enabled for native builds (AuthSession request stays null there).
    request: canPrompt ? request ?? ({ url: 'native-google' } as NonNullable<typeof request>) : null,
    signInWithGoogle,
    isGoogleConfigured: Boolean(webClientId),
    usesNativeGoogleSignIn: canUseNativeGoogle,
  };
}
