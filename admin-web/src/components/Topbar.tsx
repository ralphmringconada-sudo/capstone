import { Pressable, View, Text, StyleSheet } from "react-native";
import { Bell, Menu, UserCircle } from "lucide-react-native";
import { useAdminAuth } from "@/context/AdminAuthContext";

/**
 * Purpose: Displays global controls and the identity of the active administrator.
 * How it works:
 * 1. The authentication context supplies the current admin profile.
 * 2. The profile name and role are translated into a readable header identity.
 * Technologies Used: React, React Native Web, Lucide React Native, and React Context.
 * Why this implementation: Persistent identity helps administrators verify which account and role are active.
 */
export default function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { admin } = useAdminAuth();

  return (
    <View style={styles.topbar}>
      <Pressable
        style={({ pressed }) => [styles.menuButton, pressed && styles.menuButtonPressed]}
        onPress={onToggleSidebar}
        accessibilityRole="button"
        accessibilityLabel="Toggle navigation sidebar"
      >
        <Menu size={24} color="#000" />
      </Pressable>

      <View style={styles.right}>
        <Bell size={19} color="#000" />
        <View style={styles.divider} />
        <UserCircle size={29} color="#168A18" />
        <View>
          <Text style={styles.name}>{admin?.fullName || "Admin"}</Text>
          <Text style={styles.role}>
            {admin?.role === "super_admin" ? "Super Administrator" : "Administrator"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    height: 74,
    backgroundColor: "#ffffff",
    paddingHorizontal: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  menuButtonPressed: {
    backgroundColor: "#eef4e6",
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: "#000",
  },
  name: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 15,
    color: "#000",
  },
  role: {
    fontFamily: "Montserrat_700Bold",
    fontSize: 11,
    color: "#000",
  },
});
