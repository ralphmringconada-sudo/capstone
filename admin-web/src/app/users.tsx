import UsersScreen from "../screens/UsersScreen";

/**
 * Purpose: Defines the protected route for citizen and administrator account management.
 * How it works:
 * 1. Expo Router resolves this component for the users path.
 * 2. The component delegates role-aware account workflows to UsersScreen.
 * Technologies Used: React and Expo Router file-based routing.
 * Why this implementation: A thin route separates navigation registration from account operations.
 */
export default function Users() {
  return <UsersScreen />;
}