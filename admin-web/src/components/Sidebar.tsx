import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import {
  LayoutDashboard,
  FileText,
  Users,
  CalendarDays,
  Download,
  Settings,
  LogOut,
} from "lucide-react-native";
import { useAdminAuth } from "@/context/AdminAuthContext";

const menu = [
  { name: "Dashboard", route: "/dashboard", icon: LayoutDashboard },
  { name: "Reports", route: "/reports", icon: FileText },
  { name: "Users", route: "/users", icon: Users },
  { name: "Events", route: "/events", icon: CalendarDays },
  { name: "Export Reports", route: "/export", icon: Download },
  { name: "Settings", route: "/settings", icon: Settings },
];

/**
 * Purpose: Provides primary navigation and secure session termination for the admin portal.
 * How it works:
 * 1. Menu definitions are rendered as Expo Router navigation controls.
 * 2. The active page is highlighted from the supplied route label.
 * 3. Logout clears Firebase Authentication before returning to the public route.
 * Technologies Used: React, React Native Web, Expo Router, Lucide React Native, and Firebase Authentication.
 * Why this implementation: Central navigation gives every admin module a predictable access path.
 */
export default function Sidebar({ activePage }: { activePage: string }) {
  const { logout } = useAdminAuth();

  /**
   * Purpose: Ends the active administrator session and returns to login.
   * How it works:
   * 1. The auth context signs the Firebase user out.
   * 2. Expo Router replaces the protected route with the public root route.
   * Technologies Used: Firebase Authentication, React Context, and Expo Router.
   * Why this implementation: Awaiting sign-out prevents protected navigation from outliving the session.
   */
  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  return (
    <View style={styles.sidebar}>
      <View style={styles.logoArea}>
        <Image
          source={require("../../assets/images/ecobantay-logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.adminTitle}>ADMIN DASHBOARD</Text>
      </View>

      <View style={styles.menu}>
        {menu.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.name;

          return (
            <Pressable
              key={item.name}
              style={[styles.menuItem, active && styles.activeItem]}
              onPress={() => router.navigate(item.route as any)}
            >
              <Icon size={22} color={active ? "#ffffff" : "#000000"} />
              <Text style={[styles.menuText, active && styles.activeText]}>
                {item.name}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable style={styles.logout} onPress={handleLogout}>
        <LogOut size={22} color="#2cc6c6" />
        <Text style={styles.logoutText}>Logout</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 300,
    height: "100%",
    backgroundColor: "#E3F5B9",
    position: "relative",
  },
  logoArea: {
    alignItems: "center",
  },
  logo: {
    width: 900,
    height: 350,
    bottom: 90,
  },
  adminTitle: {
    position: "absolute",
    top: 45,
    right: 8,
    fontSize: 17,
    fontFamily: "Montserrat_700Bold",
    color: "#0B5A1E",
  },
  menu: {
    marginTop: -150,
    paddingHorizontal: 24,
    gap: 22,
  },
  menuItem: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 22,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  activeItem: {
    backgroundColor: "#3E7C40",
  },
  menuText: {
    fontSize: 19,
    fontFamily: "Montserrat_700Bold",
    color: "#0B5A1E",
  },
  activeText: {
    color: "#ffffff",
  },
  logout: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    height: 60,
    backgroundColor: "#34733B",
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    paddingLeft: 32,
  },
  logoutText: {
    color: "#ffffff",
    fontSize: 18,
    fontFamily: "Montserrat_700Bold",
  },
});
