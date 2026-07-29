import DashboardScreen from "../screens/DashboardScreen";

/**
 * Purpose: Defines the protected route that presents the administrator dashboard.
 * How it works:
 * 1. Expo Router resolves this component for the dashboard path.
 * 2. The route delegates dashboard rendering and data presentation to DashboardScreen.
 * Technologies Used: React and Expo Router file-based routing.
 * Why this implementation: Keeping the route thin isolates navigation structure from screen logic.
 */
export default function Dashboard() {
  return <DashboardScreen />;
}