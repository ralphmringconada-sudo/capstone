import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useEffect } from 'react';

WebBrowser.maybeCompleteAuthSession();

/**
 * Purpose: Configures Google OAuth for login/signup.
 * How it works: 1) reads client IDs from env. 2) builds an ID-token auth request. 3) exposes prompt + token.
 * Technologies Used: Expo AuthSession Google provider, Expo WebBrowser.
 * Why this implementation: useIdTokenAuthRequest returns a Firebase-ready ID token; missing env keeps Google disabled safely.
 */
export function useGoogleAuth() {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    // Placeholder keeps the hook mountable when env is missing; button stays disabled.
    clientId: webClientId || 'missing-google-web-client-id.apps.googleusercontent.com',
    androidClientId: androidClientId || webClientId || undefined,
    iosClientId: iosClientId || webClientId || undefined,
  });

  useEffect(() => {
    if (!webClientId) {
      console.warn(
        'Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID. Google sign-in will not work until it is configured.',
      );
    }
  }, [webClientId]);

  const idToken =
    response?.type === 'success'
      ? response.params.id_token ??
        (response as { authentication?: { idToken?: string } }).authentication?.idToken
      : null;

  return {
    request,
    response,
    idToken,
    promptAsync,
    isGoogleConfigured: Boolean(webClientId),
  };
}
