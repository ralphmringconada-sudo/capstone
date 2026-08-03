import { useEffect, useState, type ReactNode } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

/**
 * Purpose: Provides the shared visual shell used by protected administrator pages.
 * How it works:
 * 1. Sidebar receives the active page so navigation state is visible.
 * 2. Topbar presents the signed-in administrator above the supplied page content.
 * 3. Main content fades in when the active page changes.
 * Technologies Used: React, React Native Web layout components, and Reanimated.
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
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: 300 });
  }, [activePage, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View style={styles.layout}>
      <Sidebar
        activePage={activePage}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((current) => !current)}
      />
      <Animated.View style={[styles.main, animatedStyle]}>
        <Topbar onToggleSidebar={() => setSidebarCollapsed((current) => !current)} />
        {children}
      </Animated.View>
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
    // @ts-expect-error web-only viewport height so page ScrollViews can scroll
    height: "100vh",
    overflow: "hidden",
  },
});
