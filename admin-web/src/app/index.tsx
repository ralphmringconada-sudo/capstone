import LoginScreen from "../screens/LoginScreen";

/**
 * Purpose: Defines the public entry route for administrator authentication.
 * How it works:
 * 1. Expo Router loads this component for the root path.
 * 2. The component delegates the page workflow to LoginScreen.
 * Technologies Used: React and Expo Router file-based routing.
 * Why this implementation: A thin route keeps routing concerns separate from login behavior.
 */
export default function Home() {
  return <LoginScreen />;
}