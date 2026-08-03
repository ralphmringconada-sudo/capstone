import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  Image,
  TouchableOpacity,
} from "react-native";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Check,
  ClipboardList,
  UserCircle,
} from "lucide-react-native";
import { router } from "expo-router";
import AdminLayout from "../components/AdminLayout";
import DashboardCard from "../components/DashboardCard";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { useAdminData } from "@/hooks/useAdminData";
import { fetchEvents } from "@/services/adminDataService";
import { resolveReportImageUrls } from "@/services/reportImageService";
import { formatDateTime } from "@/utils/format";
import type { AdminEvent } from "@/types/admin";

/**
 * Purpose: Presents an at-a-glance operational summary for the signed-in administrator.
 * How it works:
 * 1. Shared auth and data hooks provide the active profile, reports, and derived totals.
 * 2. Paginated recent reports are selected for a compact status table.
 * 3. Metric cards and scheduled events complete the dashboard overview.
 * Technologies Used: React, React Native Web, React Context, Lucide React Native, and Firestore-backed hooks.
 * Why this implementation: A single overview helps administrators prioritize recent environmental activity.
 */
export default function DashboardScreen() {
  const { width, height } = useWindowDimensions();
  const s = Math.min(width / 1920, height / 1080);
  const panelHeight = height * 0.58;
  // Shared hook state ties the welcome identity and dashboard metrics to current backend data.
  const { admin } = useAdminAuth();
  const { reports, stats } = useAdminData();
  const [upcomingEvents, setUpcomingEvents] = useState<AdminEvent[]>([]);
  const [approvedEventsCount, setApprovedEventsCount] = useState(0);
  const [reportPage, setReportPage] = useState(1);
  const reportsPerPage = 4;
  const reportPageCount = Math.max(1, Math.ceil(reports.length / reportsPerPage));
  const currentReportPage = Math.min(reportPage, reportPageCount);
  const recentReports = useMemo(
    () =>
      reports.slice(
        (currentReportPage - 1) * reportsPerPage,
        currentReportPage * reportsPerPage,
      ),
    [reports, currentReportPage],
  );
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  const pageNumbers = useMemo((): Array<number | "..."> => {
    if (reportPageCount <= 5) {
      return Array.from({ length: reportPageCount }, (_, index) => index + 1);
    }
    if (currentReportPage <= 3) return [1, 2, 3, "...", reportPageCount];
    if (currentReportPage >= reportPageCount - 2) {
      return [1, "...", reportPageCount - 2, reportPageCount - 1, reportPageCount];
    }
    return [1, "...", currentReportPage, "...", reportPageCount];
  }, [currentReportPage, reportPageCount]);

  const ensureThumbnail = async (report: (typeof reports)[number]) => {
    if (thumbnails[report.id]) return;
    const urls = await resolveReportImageUrls(report);
    if (urls[0]) {
      setThumbnails((prev) => ({ ...prev, [report.id]: urls[0] }));
    }
  };

  useEffect(() => {
    recentReports.forEach((report) => {
      ensureThumbnail(report);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentReports]);

  useEffect(() => {
    let active = true;
    const loadEvents = async () => {
      try {
        const events = await fetchEvents();
        if (!active) return;
        const liveEvents = events.filter(
          (event) => event.status === "Upcoming" || event.status === "Ongoing",
        );
        setApprovedEventsCount(liveEvents.length);
        setUpcomingEvents(liveEvents.slice(0, 4));
      } catch {
        if (!active) return;
        setUpcomingEvents([]);
        setApprovedEventsCount(0);
      }
    };
    void loadEvents();
    return () => {
      active = false;
    };
  }, []);

  return (
    <AdminLayout activePage="Dashboard">
      <ScrollView
        style={styles.page}
        contentContainerStyle={{
          paddingHorizontal: width * 0.02,
          paddingTop: height * 0.012,
          paddingBottom: 30,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginTop: height * 0.025 }}>
          <Text style={[styles.welcome, { fontSize: 32 * s }]}>
            WELCOME BACK, {admin?.fullName?.toUpperCase() || "ADMIN"}
          </Text>
          <Text style={[styles.subtitle, { fontSize: 18 * s }]}>
            Here’s what’s happening with environmental reports
          </Text>
        </View>

        <View style={[styles.cards, { gap: width * 0.025, marginTop: height * 0.065 }]}>
          <DashboardCard title="Total Reports" value={String(stats.totalReports)} color="#DDEAD3" icon={ClipboardList} iconColor="#20B83B" />
          <DashboardCard title="Reports In Review" value={String(stats.reportsInReview)} color="#CFE6FA" icon={Check} iconColor="#259BEF" />
          <DashboardCard title="Approved Events" value={String(approvedEventsCount)} color="#FCE8C8" icon={CalendarClock} iconColor="#FF8A00" />
          <DashboardCard title="Registered Users" value={String(stats.totalUsers)} color="#E5E8F0" icon={UserCircle} iconColor="#3D8DFF" />
        </View>

        <View style={[styles.contentRow, { gap: width * 0.012, marginTop: height * 0.045 }]}>
          <View style={[styles.reportsPanel, { height: panelHeight, padding: 16 * s }]}>
            <View style={styles.panelHeader}>
              <Text style={[styles.panelTitle, { fontSize: 30 * s }]}>Recent Reports</Text>
              <TouchableOpacity onPress={() => router.navigate("/reports" as never)}>
                <Text style={[styles.viewAll, { fontSize: 16 * s }]}>View All</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.tableHeader, { height: 40 * s, paddingHorizontal: 10 * s }]}>
  <Text style={[styles.th, styles.idCol, { fontSize: 18 * s }]}>ID</Text>

  <Text
  style={[
    styles.th,
    styles.reportCol,
    {
      fontSize: 18 * s,
      marginLeft: 12 * s,
    },
  ]}
>
  Report Title
</Text>

  <Text
  style={[
    styles.th,
    styles.locationCol,
    {
      fontSize: 18 * s,
      transform: [{ translateX: -10 * s }],
    },
  ]}
>
  Location
</Text>

  <Text
    style={[
      styles.th,
      styles.categoryCol,
      {
        fontSize: 18 * s,
        textAlign: "center",
      },
    ]}
  >
    Category
  </Text>

  <Text
    style={[
      styles.th,
      styles.statusCol,
      {
        fontSize: 18 * s,
        textAlign: "center",
        transform: [{ translateX: 20 * s }],
      },
    ]}
  >
    Status
  </Text>

  <Text
    numberOfLines={1}
    style={[
      styles.th,
      styles.dateCol,
      {
        fontSize: 18 * s,
        textAlign: "center",
        marginLeft: 8 * s,
      },
    ]}
  >
    Date Submitted
  </Text>
</View>

            {recentReports.map((report) => {
              const submitted = formatDateTime(report.createdAt);
              return (
              <View key={report.id} style={[styles.tableRow, { height: 105 * s, paddingHorizontal: 10 * s }]}>
                <Text style={[styles.td, styles.idCol, { fontSize: 16 * s }]}>#{report.id.slice(0, 8)}</Text>

                <View style={[styles.reportTitleBox, styles.reportCol]}>
                  <View style={[styles.imageBox, { width: 50 * s, height: 50 * s }]}>
                    {thumbnails[report.id] ? (
                      <Image
                        source={{ uri: thumbnails[report.id] }}
                        style={{ width: "100%", height: "100%" }}
                        resizeMode="cover"
                      />
                    ) : null}
                  </View>
                  <Text style={[styles.reportTitle, { fontSize: 16 * s }]}>{report.title}</Text>
                </View>

                <Text
  style={[
    styles.td,
    styles.locationCol,
    {
      fontSize: 16 * s,
      transform: [{ translateX: -15 * s }],
    },
  ]}
>
  {report.location}
</Text>

                <View style={[styles.categoryCol, styles.badgeWrap]}>
                  <Text
                    style={[
                      styles.badge,
                      badgeColor(report.category),
                      {
                        fontSize: 16 * s,
                        paddingHorizontal: 10 * s,
                        paddingVertical: 7 * s,
                      },
                    ]}
                  >
                    {report.category}
                  </Text>
                </View>

                <View style={[styles.statusCol, styles.badgeWrap]}>
                  <Text
                    style={[
                      styles.badge,
                      statusColor(report.status),
                      {
                        fontSize: 16 * s,
                        paddingHorizontal: 10 * s,
                        paddingVertical: 7 * s,
                        transform: [{ translateX: 10 * s }],
                      },
                    ]}
                  >
                    {report.status}
                  </Text>
                </View>

                <Text
                  style={[
                    styles.td,
                    styles.dateCol,
                    {
                      fontSize: 16 * s,
                      textAlign: "center",
                    },
                  ]}
                >
                  {submitted.date}
                </Text>
              </View>
            )})}

            <View style={styles.paginationRow}>
              <Text style={[styles.showing, { fontSize: 16 * s }]}>
                Showing {reports.length ? (currentReportPage - 1) * reportsPerPage + 1 : 0} to{" "}
                {Math.min(currentReportPage * reportsPerPage, reports.length)} of{" "}
                {stats.totalReports} reports
              </Text>
              <View style={styles.paginationButtons}>
                <TouchableOpacity
                  style={styles.paginationButton}
                  disabled={currentReportPage === 1}
                  onPress={() => setReportPage((value) => Math.max(1, value - 1))}
                >
                  <Text style={[styles.pagination, { fontSize: 16 * s }]}>‹</Text>
                </TouchableOpacity>
                {pageNumbers.map((entry, index) =>
                  entry === "..." ? (
                    <Text
                      key={`ellipsis-${index}`}
                      style={[styles.pagination, { fontSize: 16 * s, paddingHorizontal: 4 }]}
                    >
                      ...
                    </Text>
                  ) : (
                    <TouchableOpacity
                      key={entry}
                      style={[
                        styles.paginationButton,
                        currentReportPage === entry && styles.paginationButtonActive,
                      ]}
                      onPress={() => setReportPage(entry)}
                    >
                      <Text
                        style={[
                          styles.pagination,
                          { fontSize: 16 * s },
                          currentReportPage === entry && styles.paginationTextActive,
                        ]}
                      >
                        {entry}
                      </Text>
                    </TouchableOpacity>
                  ),
                )}
                <TouchableOpacity
                  style={styles.paginationButton}
                  disabled={currentReportPage === reportPageCount}
                  onPress={() => setReportPage((value) => Math.min(reportPageCount, value + 1))}
                >
                  <Text style={[styles.pagination, { fontSize: 16 * s }]}>›</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={[styles.eventsPanel, { height: panelHeight, padding: 16 * s }]}>
            <View style={styles.panelHeader}>
              <Text style={[styles.panelTitle, { fontSize: 30 * s }]}>Upcoming Events</Text>
              <TouchableOpacity onPress={() => router.navigate("/events" as never)}>
                <Text style={[styles.viewAll, { fontSize: 16 * s }]}>View All</Text>
              </TouchableOpacity>
            </View>

            {upcomingEvents.length ? (
              upcomingEvents.map((event) => (
                <View key={event.id} style={[styles.eventRow, { height: 96 * s }]}>
                  <View style={[styles.eventImage, { width: 58 * s, height: 58 * s }]} />
                  <View style={styles.eventInfo}>
                    <Text style={[styles.eventTitle, { fontSize: 18 * s }]}>{event.title}</Text>
                    <Text style={[styles.eventDate, { fontSize: 14 * s }]}>
                      ▣ {event.date}  ♦ {event.location}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.upcomingBadge,
                      {
                        fontSize: 16 * s,
                        paddingHorizontal: 18 * s,
                        paddingVertical: 10 * s,
                        backgroundColor: event.status === "Ongoing" ? "#C7DDFF" : "#E8C1EF",
                      },
                    ]}
                  >
                    {event.status}
                  </Text>
                </View>
              ))
            ) : (
              <View style={styles.emptyEvents}>
                <Text style={[styles.emptyEventsText, { fontSize: 15 * s }]}>
                  No upcoming events yet. Approved admin and user events will appear here.
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </AdminLayout>
  );
}

/**
 * Purpose: Maps report categories to distinguishable dashboard badge colors.
 * How it works:
 * 1. Known category keywords select predefined background and text colors.
 * 2. Unmatched categories use the shared green fallback.
 * Technologies Used: TypeScript string matching and React Native style objects.
 * Why this implementation: Consistent visual categories improve rapid table scanning.
 */
function badgeColor(category: string) {
  if (category.includes("Water")) return { backgroundColor: "#D7B9EA", color: "#6B168F" };
  if (category.includes("Illegal Logging")) return { backgroundColor: "#FFD6A4", color: "#E86C00" };
  if (category.includes("Wildlife")) return { backgroundColor: "#F5D894", color: "#946600" };
  return { backgroundColor: "#BFEBC5", color: "#168A18" };
}

/**
 * Purpose: Maps report workflow status to a semantic dashboard badge.
 * How it works:
 * 1. Pending and in-review statuses receive distinct warning and information colors.
 * 2. Other completed statuses receive the green fallback.
 * Technologies Used: TypeScript conditionals and React Native style objects.
 * Why this implementation: Status color reinforces workflow meaning without changing report data.
 */
function statusColor(status: string) {
  if (status === "Pending") return { backgroundColor: "#FFF0B8", color: "#D99A00" };
  if (status === "In Review") return { backgroundColor: "#C7DDFF", color: "#315BC9" };
  return { backgroundColor: "#BFEBC5", color: "#168A18" };
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  welcome: {
    fontFamily: "Montserrat_700Bold",
    color: "#0B5A1E",
  },
  subtitle: {
    fontFamily: "Montserrat_700Bold",
    color: "#5D8A5F",
    marginTop: 2,
  },
  cards: {
    flexDirection: "row",
    width: "100%",
  },
  contentRow: {
    flexDirection: "row",
    width: "100%",
  },
  reportsPanel: {
    flex: 1.28,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d6d6d6",
    borderRadius: 8,
  },
  eventsPanel: {
    flex: 0.88,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d6d6d6",
    borderRadius: 8,
  },
  panelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  panelTitle: {
    fontFamily: "Montserrat_700Bold",
    color: "#000",
  },
  viewAll: {
    fontFamily: "Montserrat_700Bold",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 4,
    paddingHorizontal: 18,
    paddingVertical: 7,
    color: "#000",
  },
  tableHeader: {
    backgroundColor: "#f6f6f6",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  tableRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    flexDirection: "row",
    alignItems: "center",
  },
  th: {
    fontFamily: "Montserrat_700Bold",
    color: "#000",
    textAlign: "left",
  },
  td: {
    fontFamily: "Montserrat_700Bold",
    color: "#000",
  },

  idCol: {
  width: "10%",
},
reportCol: {
  width: "26%",
},
locationCol: {
  width: "17%",
},
categoryCol: {
  width: "14%",
},
statusCol: {
  width: "15%",
},
dateCol: {
  width: "18%",
},

  reportTitleBox: {
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
  marginLeft: 12,
},
  imageBox: {
    borderRadius: 4,
    backgroundColor: "#d9d9d9",
    overflow: "hidden",
  },
  reportTitle: {
    flex: 0.8,
    fontFamily: "Montserrat_700Bold",
    color: "#000",
  },
  badgeWrap: {
    justifyContent: "center",
    alignItems: "center",
  },
  badge: {
  alignSelf: "center",
  paddingHorizontal: 10,
  paddingVertical: 7,
  borderRadius: 8,
  fontFamily: "Montserrat_700Bold",
  textAlign: "center",
  overflow: "hidden",

  flexGrow: 0,
  flexShrink: 0,
  },
  paginationRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  showing: {
    fontFamily: "Montserrat_700Bold",
    color: "#000",
  },
  paginationButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  paginationButton: {
    minWidth: 28,
    height: 28,
    borderWidth: 1,
    borderColor: "#a9b3a9",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  paginationButtonActive: {
    backgroundColor: "#34733B",
    borderColor: "#34733B",
  },
  pagination: {
    fontFamily: "Montserrat_700Bold",
    color: "#34733B",
  },
  paginationTextActive: {
    color: "#ffffff",
  },
  eventRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  eventImage: {
    backgroundColor: "#d9d9d9",
    borderRadius: 4,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontFamily: "Montserrat_700Bold",
    color: "#000",
  },
  eventDate: {
    fontFamily: "Montserrat_700Bold",
    color: "#000",
    marginTop: 4,
  },
  emptyEvents: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  emptyEventsText: {
    fontFamily: "Montserrat_700Bold",
    color: "#777",
    textAlign: "center",
  },
  upcomingBadge: {
    backgroundColor: "#D7B9EA",
    color: "#6B168F",
    borderRadius: 4,
    fontFamily: "Montserrat_700Bold",
    overflow: "hidden",
  },
});