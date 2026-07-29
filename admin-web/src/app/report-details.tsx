import ReportDetailsScreen from "../screens/ReportDetailsScreen";

/**
 * Purpose: Defines the route used to inspect and act on one environmental report.
 * How it works:
 * 1. Expo Router resolves this component for the report-details path.
 * 2. ReportDetailsScreen reads the route identifier and manages the detailed workflow.
 * Technologies Used: React and Expo Router file-based routing.
 * Why this implementation: The route remains declarative while the screen owns report-specific logic.
 */
export default function ReportDetails() {
  return <ReportDetailsScreen />;
}