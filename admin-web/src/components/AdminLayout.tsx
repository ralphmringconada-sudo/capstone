import { useState, type ReactNode } from "react";
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
export default function AdminLayout({
  children,
  activePage,
}: {
  children: ReactNode;
  activePage: string;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <View style={styles.layout}>
      <Sidebar
        activePage={activePage}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((current) => !current)}
      />
      <View style={styles.main}>
        <Topbar onToggleSidebar={() => setSidebarCollapsed((current) => !current)} />
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