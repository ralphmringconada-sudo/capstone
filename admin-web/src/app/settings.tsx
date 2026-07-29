import SettingsScreen from "../screens/SettingsScreen";

/**
 * Purpose: Defines the protected route for administrator account settings.
 * How it works:
 * 1. Expo Router resolves this component for the settings path.
 * 2. The route delegates profile and password workflows to SettingsScreen.
 * Technologies Used: React and Expo Router file-based routing.
 * Why this implementation: Routing remains independent from sensitive account-update logic.
 */
export default function Settings() {
  return <SettingsScreen />;
}