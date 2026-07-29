import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useEffect } from 'react';

WebBrowser.maybeCompleteAuthSession();

/**
 * Purpose: Configures and exposes the Google OAuth flow used by login and registration.
 * How it works: 1) reads platform client IDs. 2) creates an Expo auth request. 3) derives the returned ID token.
 * Technologies Used: Expo AuthSession, Expo WebBrowser, Google OAuth, React useEffect.
 * Why this implementation: One hook keeps provider configuration and response handling consistent across screens.
 */
export function useGoogleAuth() {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId,
    androidClientId: androidClientId || webClientId,
    iosClientId: iosClientId || webClientId,
  });

  /* Configuration validation: warn developers before a user reaches a nonfunctional Google sign-in button. */
  useEffect(() => {
    if (!webClientId) {
      console.warn(
        'Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID. Google sign-in will not work until it is configured.',
      );
    }
  }, [webClientId]);

  const idToken = response?.type === 'success' ? response.params.id_token : null;

  return {
    request,
    response,
    idToken,
    promptAsync,
    isGoogleConfigured: Boolean(webClientId),
  };
}
