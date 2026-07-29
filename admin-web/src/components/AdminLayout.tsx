import { View, StyleSheet } from "react-native";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

/**
 * Purpose: Provides the shared visual shell used by protected administrator pages.
 * How it works:
 * 1. Sidebar receives the active page so navigation state is visible.
 * 2. Topbar presents the signed-in administrator above the supplied page content.
 * Technologies Used: React and React Native Web layout components.
 * Why this implementation: One reusable shell keeps navigation and identity presentation consistent.
 */
export default function AdminLayout({ children, activePage }: any) {
  return (
    <View style={styles.layout}>
      <Sidebar activePage={activePage} />
      <View style={styles.main}>
        <Topbar />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#ffffff",
  },
  main: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
});