import ReportsScreen from "../screens/ReportsScreen";

/**
 * Purpose: Defines the protected route for environmental report management.
 * How it works:
 * 1. Expo Router resolves this component for the reports path.
 * 2. The route delegates filtering and report actions to ReportsScreen.
 * Technologies Used: React and Expo Router file-based routing.
 * Why this implementation: A route-only component keeps navigation independent from report workflows.
 */
export default function Reports() {
  return <ReportsScreen />;
}