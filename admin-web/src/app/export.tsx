import ExportScreen from "../screens/ExportScreen";

/**
 * Purpose: Defines the route reserved for exporting administrative report data.
 * How it works:
 * 1. Expo Router resolves this component for the export path.
 * 2. The component delegates the page presentation to ExportScreen.
 * Technologies Used: React and Expo Router file-based routing.
 * Why this implementation: A stable route boundary allows export features to grow independently.
 */
export default function Export() {
  return <ExportScreen />;
}