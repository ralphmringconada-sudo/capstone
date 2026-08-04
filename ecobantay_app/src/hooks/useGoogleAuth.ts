/**
 * Purpose: Placeholder Google auth hook while native Android OAuth is not configured.
 * How it works: Returns disabled Google auth state without loading AuthSession native modules.
 * Technologies Used: React Native Platform constants.
 * Why this implementation: Calling Google.useAuthRequest on screen mount was crashing the release APK.
 */
export function useGoogleAuth() {
  return {
    request: null,
    response: null,
    idToken: null,
    promptAsync: async () => ({ type: 'dismiss' as const }),
    isGoogleConfigured: false,
    redirectUri: '',
  };
}
