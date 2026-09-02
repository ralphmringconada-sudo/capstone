import { useCallback, useEffect, useState } from "react";
import { Pressable, View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Bell, Menu, UserCircle } from "lucide-react-native";
import { useAdminAuth } from "@/context/AdminAuthContext";
import {
  fetchAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from "@/services/adminNotificationService";
import type { AdminInboxNotification } from "@/types/admin";

/** Maps an inbox item to a report/event screen when a relatedId is present. */
function routeForAdminNotification(
  item: AdminInboxNotification,
): { pathname: "/report-details" | "/events"; params: Record<string, string> } | null {
  const relatedId = item.relatedId?.trim();
  if (!relatedId) return null;

  const title = item.title.toLowerCase();
  if (item.type === "report" || title.startsWith("report") || title.includes("environmental report")) {
    return { pathname: "/report-details", params: { id: relatedId } };
  }
  if (item.type === "event" || title.startsWith("event") || title.includes("new event")) {
    return { pathname: "/events", params: { eventId: relatedId } };
  }
  if (item.type === "approval") {
    if (title.startsWith("report")) {
      return { pathname: "/report-details", params: { id: relatedId } };
    }
    return { pathname: "/events", params: { eventId: relatedId } };
  }
  return null;
}

export default function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const router = useRouter();
  const { admin } = useAdminAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AdminInboxNotification[]>([]);

  const prefs = {
    reportUpdates: admin?.notificationPrefs?.reportUpdates !== false,
    eventUpdates: admin?.notificationPrefs?.eventUpdates !== false,
    approvalUpdates: admin?.notificationPrefs?.approvalUpdates !== false,
    userActivity: admin?.notificationPrefs?.userActivity !== false,
  };

  const load = useCallback(async () => {
    try {
      const all = await fetchAdminNotifications();
      setItems(
        all.filter((item) => {
          if (item.type === "report" && !prefs.reportUpdates) return false;
          if (item.type === "event" && !prefs.eventUpdates) return false;
          if (item.type === "approval" && !prefs.approvalUpdates) return false;
          if (item.type === "activity" && !prefs.userActivity) return false;
          return true;
        }),
      );
    } catch {
      setItems([]);
    }
  }, [
    prefs.approvalUpdates,
    prefs.eventUpdates,
    prefs.reportUpdates,
    prefs.userActivity,
  ]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, [load]);

  const unread = items.filter((item) => !item.read).length;

  const handleNotificationPress = async (item: AdminInboxNotification) => {
    if (!item.read) {
      try {
        await markAdminNotificationRead(item.id);
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
    const route = routeForAdminNotification(item);
    if (route) {
      router.push(route as never);
      return;
    }
    await load();
  };

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
        <Pressable
          style={styles.bellWrap}
          onPress={() => {
            setOpen(true);
            void load();
          }}
        >
          <Bell size={19} color="#000" />
          {unread > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
            </View>
          ) : null}
        </Pressable>
        <View style={styles.divider} />
        <UserCircle size={29} color="#168A18" />
        <View>
          <Text style={styles.name}>{admin?.fullName || "Admin"}</Text>
          <Text style={styles.role}>
            {admin?.role === "super_admin" ? "Super Administrator" : "Administrator"}
          </Text>
        </View>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.panel} onPress={(e) => e.stopPropagation?.()}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Notifications</Text>
              <TouchableOpacity
                onPress={async () => {
                  await markAllAdminNotificationsRead();
                  await load();
                }}
              >
                <Text style={styles.markAll}>Mark all read</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {items.length === 0 ? (
                <Text style={styles.empty}>No notifications yet.</Text>
              ) : (
                items.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.item, !item.read && styles.itemUnread]}
                    onPress={() => void handleNotificationPress(item)}
                  >
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemBody}>{item.body}</Text>
                    <Text style={styles.itemMeta}>
                      {item.type.toUpperCase()} · {new Date(item.createdAt).toLocaleString()}
                      {item.relatedId ? " · Tap to open" : ""}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
  bellWrap: { position: "relative", padding: 4 },
  badge: {
    position: "absolute",
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#d92d20",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 9, fontFamily: "Montserrat_700Bold" },
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
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 70,
    paddingRight: 24,
  },
  panel: {
    width: 360,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  panelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  panelTitle: { fontFamily: "Montserrat_700Bold", fontSize: 16 },
  markAll: { fontFamily: "Montserrat_600SemiBold", color: "#168A18", fontSize: 12 },
  empty: { fontFamily: "Montserrat_500Medium", color: "#777", paddingVertical: 20, textAlign: "center" },
  item: {
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingVertical: 10,
  },
  itemUnread: { backgroundColor: "#f4faf0" },
  itemTitle: { fontFamily: "Montserrat_700Bold", color: "#111", marginBottom: 4 },
  itemBody: { fontFamily: "Montserrat_500Medium", color: "#444", marginBottom: 4 },
  itemMeta: { fontFamily: "Montserrat_400Regular", color: "#888", fontSize: 11 },
});
