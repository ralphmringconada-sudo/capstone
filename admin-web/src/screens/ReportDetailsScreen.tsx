import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Image,
  useWindowDimensions,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";
import {
  ArrowLeft,
  ClipboardList,
  MapPin,
  Camera,
  History,
  Settings,
  Check,
  X,
  ExternalLink,
} from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import AdminLayout from "../components/AdminLayout";
import InteractiveLocationMap from "@/components/InteractiveLocationMap";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { fetchReportById, updateReportStatus } from "@/services/adminDataService";
import { resolveReportImageUrls } from "@/services/reportImageService";
import type { Report, ReportStatusHistoryEntry } from "@/types/admin";
import { formatDateTime } from "@/utils/format";

/**
 * Purpose: Builds a displayable status timeline from persisted history or report timestamps.
 * How it works: Uses statusHistory when present; otherwise seeds Pending from createdAt and
 * the current status from updatedAt so older reports still show a usable trail.
 */
function buildStatusHistoryRows(report: Report): Array<{
  status: string;
  atLabel: string;
  remarks: string;
  active: boolean;
}> {
  const history = [...(report.statusHistory || [])].sort((a, b) =>
    (a.at || "").localeCompare(b.at || ""),
  );

  const rows: ReportStatusHistoryEntry[] = history.length
    ? history
    : [
        {
          status: "Pending",
          at: report.createdAt,
          remarks: "Report submitted by user",
        },
        ...(report.status !== "Pending"
          ? [
              {
                status: report.status,
                at: report.updatedAt || report.createdAt,
                remarks:
                  report.status === "In Review"
                    ? "Report moved to review"
                    : report.status === "Resolved"
                      ? "Report resolved by admin"
                      : "Report rejected by admin",
              } satisfies ReportStatusHistoryEntry,
            ]
          : []),
      ];

  // Deduplicate consecutive identical statuses while keeping chronological order.
  const uniqueRows: ReportStatusHistoryEntry[] = [];
  for (const entry of rows) {
    const previous = uniqueRows[uniqueRows.length - 1];
    if (previous && previous.status === entry.status && previous.at === entry.at) {
      continue;
    }
    uniqueRows.push(entry);
  }

  return uniqueRows.map((entry) => {
    const stamped = entry.at ? formatDateTime(entry.at) : null;
    return {
      status: entry.status,
      atLabel: stamped ? `${stamped.date} · ${stamped.time}` : "—",
      remarks:
        entry.remarks ||
        (entry.byName ? `Updated by ${entry.byName}` : "Status updated"),
      active: true,
    };
  });
}

/**
 * Purpose: Presents complete report evidence and consequential administrator actions.
 * How it works:
 * 1. The Expo Router parameter identifies the Firestore report document.
 * 2. Report data and compatible image references populate evidence and location sections.
 * 3. Authenticated actions update status, delete the report, and create audit records.
 * 4. Loading, update, and error state communicate each asynchronous workflow.
 * Technologies Used: React hooks, React Native Web, Expo Router, Cloud Firestore, and map/image URLs.
 * Why this implementation: Consolidating evidence and actions supports informed, traceable moderation.
 */
export default function ReportDetailsScreen() {
  const { width, height } = useWindowDimensions();
  const s = Math.min(width / 1920, height / 1080);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { admin } = useAdminAuth();
  /*
   * Report and image state form the displayed evidence snapshot.
   * Loading, updating, and error state distinguish initial retrieval from admin actions.
   */
  const [report, setReport] = useState<Report | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    /*
     * Load the Firestore report selected by the route, then resolve current or legacy
     * evidence references so older submissions remain reviewable.
     */
    (async () => {
      setIsLoading(true);
      try {
        const item = await fetchReportById(String(id));
        setReport(item);
        if (item) {
          setImageUrls(await resolveReportImageUrls(item));
        } else {
          setImageUrls([]);
        }
      // Convert Firestore or image-resolution failures into visible screen feedback.
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load report.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id]);

  /**
   * Purpose: Applies an administrator's report status decision and refreshes displayed evidence.
   * How it works:
   * 1. The report and authenticated administrator are required.
   * 2. Firestore status and audit records are updated through the data service.
   * 3. The report and its image references are reloaded after the write.
   * Technologies Used: React state, Cloud Firestore services, React Context, and asynchronous JavaScript.
   * Why this implementation: Reloading from the data source confirms the persisted moderation result.
   */
  const applyStatusUpdate = async (status: Report["status"], details: string) => {
    if (!report || !admin || isUpdating) return;

    setIsUpdating(true);
    setError("");
    try {
      await updateReportStatus(report.id, status, admin, details);
      const refreshed = await fetchReportById(report.id);
      setReport(refreshed);
      if (refreshed) {
        setImageUrls(await resolveReportImageUrls(refreshed));
      }
      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(`Status updated: report marked as ${status}.`);
      } else {
        Alert.alert("Status updated", `Report marked as ${status}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update report.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStatusUpdate = (status: Report["status"], details: string) => {
    if (!report || !admin || isUpdating) return;

    if (report.status === "Resolved" || report.status === "Rejected") {
      setError("This report is already closed and cannot be updated.");
      return;
    }

    if (report.status === "In Review" && status === "In Review") {
      setError("This report is already in review.");
      return;
    }

    const title = "Confirm status change";
    const message = `Mark this report as "${status}"?`;
    const run = () => {
      void applyStatusUpdate(status, details);
    };

    // Prefer window.confirm on web so the popup is reliable in browsers.
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      if (window.confirm(`${title}\n\n${message}`)) {
        run();
      }
      return;
    }

    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", onPress: run },
    ]);
  };

  if (isLoading) {
    return (
      <AdminLayout activePage="Reports">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#34733B" />
        </View>
      </AdminLayout>
    );
  }

  if (!report) {
    return (
      <AdminLayout activePage="Reports">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text>Report not found.</Text>
        </View>
      </AdminLayout>
    );
  }

  const submitted = formatDateTime(report.createdAt);
  const isClosed = report.status === "Resolved" || report.status === "Rejected";
  const canMarkInReview = report.status === "Pending";
  const canMarkResolved = report.status === "Pending" || report.status === "In Review";
  const canReject = report.status === "Pending" || report.status === "In Review";

  return (
    <AdminLayout activePage="Reports">
      <ScrollView
        style={styles.page}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: height * 0.035,
          paddingBottom: 48,
          flexGrow: 1,
          width: "100%",
          maxWidth: 1600,
          alignSelf: "center",
        }}
        showsVerticalScrollIndicator
        persistentScrollbar
      >
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft size={28 * s} color="#000" />
        </TouchableOpacity>

        <Text style={[styles.pageTitle, { fontSize: 42 * s, marginTop: 28 * s }]}>
          REPORT DETAILS
        </Text>

        <View style={[styles.grid, { gap: 22 * s, marginTop: 28 * s }]}>
          <View style={styles.leftColumn}>
            <View style={[styles.panel, { padding: 18 * s }]}>
              <SectionTitle icon={ClipboardList} title="Report Information" s={s} />

              <View style={styles.infoRowTop}>
                <Text style={[styles.label, { fontSize: 18 * s }]}>Description</Text>
                <Text style={[styles.description, { fontSize: 16 * s }]}>
                  {report.description}
                </Text>
              </View>

              <InfoRow label="Category" value={report.category} s={s} />
              <InfoRow label="Date Submitted" value={`${submitted.date} · ${submitted.time}`} s={s} />

              <View style={styles.infoRow}>
                <Text style={[styles.label, { fontSize: 18 * s }]}>Status</Text>
                <Text
                  style={[
                    styles.badge,
                    historyBadgeColor(report.status),
                    {
                      fontSize: 16 * s,
                      paddingHorizontal: 9 * s,
                      paddingVertical: 5 * s,
                    },
                  ]}
                >
                  {report.status}
                </Text>
              </View>
            </View>

            <View style={[styles.panel, { padding: 18 * s, marginTop: 22 * s }]}>
              <SectionTitle icon={Camera} title={`Attached Images (${imageUrls.length})`} s={s} />

              <View style={styles.imagesRow}>
                {imageUrls.length ? (
                  imageUrls.map((imageUrl, index) => (
                    <Image
                      key={`${report.id}-${index}`}
                      source={{ uri: imageUrl }}
                      style={[styles.reportImage, { width: 180 * s, height: 140 * s }]}
                      resizeMode="contain"
                    />
                  ))
                ) : (
                  <Text style={[styles.valueText, { fontSize: 16 * s }]}>No images attached.</Text>
                )}
              </View>

              {report.imageTimestamp ? (
                <InfoRow label="Photo Time" value={report.imageTimestamp} s={s} />
              ) : null}
              {report.imageLocation ? (
                <InfoRow label="Photo Location" value={report.imageLocation} s={s} />
              ) : null}
              {report.coordinates ? (
                <InfoRow
                  label="GPS Coordinates"
                  value={`${report.coordinates.latitude.toFixed(6)}, ${report.coordinates.longitude.toFixed(6)}`}
                  s={s}
                />
              ) : null}
            </View>

            <View style={[styles.panel, { padding: 18 * s, marginTop: 22 * s }]}>
              <SectionTitle icon={History} title="Status History" s={s} />

              {buildStatusHistoryRows(report).map((item, index) => (
                <View key={`${item.status}-${item.atLabel}-${index}`} style={[styles.historyRow, { minHeight: 42 * s }]}>
                  <View style={styles.historyDotCol}>
                    <View
                      style={[
                        styles.dot,
                        historyDotColor(item.status),
                      ]}
                    />
                  </View>

                  <View style={styles.historyStatusCol}>
                    <Text
                      style={[
                        styles.badge,
                        historyBadgeColor(item.status),
                        {
                          fontSize: 16 * s,
                          paddingHorizontal: 9 * s,
                          paddingVertical: 5 * s,
                        },
                      ]}
                    >
                      {item.status}
                    </Text>
                  </View>

                  <Text style={[styles.historyDateCol, { fontSize: 16 * s }]}>
                    {item.atLabel}
                  </Text>

                  <Text style={[styles.historyRemarksCol, { fontSize: 16 * s }]}>
                    {item.remarks}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.rightColumn}>
            <View style={[styles.panel, { padding: 18 * s }]}>
              <SectionTitle icon={MapPin} title="Location" s={s} />

              <InteractiveLocationMap
                coordinates={report.coordinates}
                height={170 * s}
              />

              <View style={styles.locationFooter}>
                <Text style={[styles.locationText, { fontSize: 16 * s }]}>
                  {report.city || "Valencia, Negros Oriental"}
                  {"\n"}
                  {report.location}
                  {report.coordinates
                    ? `\nGPS: ${report.coordinates.latitude.toFixed(6)}, ${report.coordinates.longitude.toFixed(6)}`
                    : ""}
                </Text>

                <TouchableOpacity
                  style={styles.mapButton}
                  disabled={!report.coordinates}
                  onPress={() => {
                    if (!report.coordinates) return;
                    const { latitude, longitude } = report.coordinates;
                    Linking.openURL(
                      `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
                    );
                  }}
                >
                  <Text style={[styles.mapButtonText, { fontSize: 16 * s }]}>
                    View in Maps
                  </Text>
                  <ExternalLink size={18* s} color="#20B83B" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.panel, { padding: 18 * s, marginTop: 22 * s }]}>
              <SectionTitle icon={MapPin} title="Reported By" s={s} />

              <InfoRow label="User ID" value={report.reportedByUid} s={s} />
              <InfoRow label="Name" value={report.reportedByName} s={s} />
              <InfoRow label="Email" value={report.reportedByEmail || "-"} s={s} />
            </View>

            <View style={[styles.panel, { padding: 18 * s, marginTop: 22 * s }]}>
              <SectionTitle icon={Settings} title="Actions" s={s} />

              {error ? <Text style={{ color: "#8B1E1E", marginBottom: 8 * s }}>{error}</Text> : null}

              {isClosed ? (
                <Text style={[styles.closedHint, { fontSize: 15 * s }]}>
                  This report is {report.status.toLowerCase()} and can no longer be updated.
                </Text>
              ) : null}

              {canMarkInReview ? (
                <ActionButton
                  text="Mark as In Review"
                  color="#259BEF"
                  icon={Check}
                  s={s}
                  onPress={() => handleStatusUpdate("In Review", "Marked report as in review")}
                  disabled={isUpdating}
                />
              ) : null}

              {canMarkResolved ? (
                <ActionButton
                  text="Mark as Resolved"
                  color="#20B83B"
                  icon={Check}
                  s={s}
                  onPress={() => handleStatusUpdate("Resolved", "Approved and resolved report")}
                  disabled={isUpdating}
                />
              ) : null}

              {canReject ? (
                <ActionButton
                  text="Reject Report"
                  color="#FF3B3B"
                  icon={X}
                  s={s}
                  onPress={() => handleStatusUpdate("Rejected", "Rejected report")}
                  disabled={isUpdating}
                />
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>
    </AdminLayout>
  );
}

/**
 * Purpose: Renders a consistent heading for each report-information section.
 * How it works:
 * 1. A supplied icon and title are arranged in the shared section row.
 * 2. The responsive scale adjusts icon and text size.
 * Technologies Used: React, React Native Web, and Lucide-compatible icons.
 * Why this implementation: A helper component keeps evidence sections visually consistent.
 */
function SectionTitle({ icon: Icon, title, s }: any) {
  return (
    <View style={styles.sectionTitleRow}>
      <Icon size={18 * s} color="#000" />
      <Text style={[styles.sectionTitle, { fontSize: 18 * s }]}>{title}</Text>
    </View>
  );
}

/**
 * Purpose: Renders one labeled value within the report detail layout.
 * How it works:
 * 1. Label and value are placed in the shared information row.
 * 2. The responsive scale adjusts typography.
 * Technologies Used: React and React Native Web.
 * Why this implementation: Reuse preserves alignment across heterogeneous report fields.
 */
function InfoRow({ label, value, s }: any) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.label, { fontSize: 18 * s }]}>{label}</Text>
      <Text style={[styles.valueText, { fontSize: 16 * s }]}>{value}</Text>
    </View>
  );
}

/**
 * Purpose: Renders a reusable control for consequential report actions.
 * How it works:
 * 1. Supplied icon, text, and semantic color identify the action.
 * 2. Disabled state blocks repeated presses and lowers visual emphasis.
 * Technologies Used: React, React Native Web, and Lucide-compatible icons.
 * Why this implementation: One control gives all moderation actions consistent feedback.
 */
function ActionButton({ text, color, icon: Icon, s, onPress, disabled }: any) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.actionButton, { borderColor: color, marginTop: 18 * s, opacity: disabled ? 0.6 : 1 }]}
    >
      <Icon size={17 * s} color={color} />
      <Text style={[styles.actionButtonText, { color, fontSize: 16 * s }]}>
        {text}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * Purpose: Selects the semantic badge style for a report history status.
 * How it works:
 * 1. Known workflow values map to pending, review, or resolved styles.
 * 2. Remaining values use the rejection style.
 * Technologies Used: TypeScript conditionals and React Native styles.
 * Why this implementation: Shared mappings keep historical and current status meaning consistent.
 */
function historyBadgeColor(status: string) {
  if (status === "Pending") return styles.pendingBadge;
  if (status === "In Review") return styles.reviewBadge;
  if (status === "Resolved") return styles.resolvedBadge;
  return styles.rejectedBadge;
}

/** Timeline dots use the same semantic colors as status badges. */
function historyDotColor(status: string) {
  if (status === "Pending") {
    return { backgroundColor: "#F5B351", borderColor: "#E39A2E" };
  }
  if (status === "In Review") {
    return { backgroundColor: "#315BC9", borderColor: "#259BEF" };
  }
  if (status === "Resolved") {
    return { backgroundColor: "#168A18", borderColor: "#20B83B" };
  }
  return { backgroundColor: "#D83030", borderColor: "#B71C1C" };
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#fff",
    // Keep the report details pane independently scrollable on web.
    // @ts-expect-error web-only overflow for visible scrollbar
    overflowY: "auto",
    // @ts-expect-error web-only height constraint
    maxHeight: "calc(100vh - 72px)",
  },
  closedHint: {
    color: "#555",
    fontFamily: "Montserrat_700Bold",
    marginBottom: 4,
    lineHeight: 22,
  },
  pageTitle: {
    fontFamily: "Montserrat_700Bold",
    color: "#0B5A1E",
  },
  grid: {
    flexDirection: "row",
    width: "100%",
    alignItems: "flex-start",
  },
  leftColumn: {
    flex: 1.2,
    minWidth: 0,
  },
  rightColumn: {
    flex: 1,
    minWidth: 0,
  },
  panel: {
    borderWidth: 1,
    borderColor: "#d6d6d6",
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 22,
  },
  sectionTitle: {
    fontFamily: "Montserrat_700Bold",
    color: "#000",
  },
  infoRowTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: "#d6d6d6",
    paddingBottom: 18,
    marginBottom: 10,
    gap: 16,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: "#d6d6d6",
    paddingVertical: 18,
    gap: 16,
  },
  label: {
    width: "38%",
    paddingRight: 12,
    fontFamily: "Montserrat_700Bold",
    color: "#000",
  },
  description: {
    flex: 1,
    fontFamily: "Montserrat_700Bold",
    color: "#333",
    lineHeight: 22,
    paddingLeft: 4,
  },
  valueText: {
    flex: 1,
    fontFamily: "Montserrat_700Bold",
    color: "#000",
    lineHeight: 22,
    paddingLeft: 4,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 5,
    fontFamily: "Montserrat_700Bold",
    overflow: "hidden",
    textAlign: "center",
  },
  pendingBadge: {
    backgroundColor: "#FFF0B8",
    color: "#D99A00",
  },
  reviewBadge: {
    backgroundColor: "#C7DDFF",
    color: "#315BC9",
  },
  resolvedBadge: {
    backgroundColor: "#BFEBC5",
    color: "#168A18",
  },
  rejectedBadge: {
    backgroundColor: "#FFD0D0",
    color: "#D83030",
  },
  imagesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  reportImage: {
    borderRadius: 7,
    backgroundColor: "#ddd",
  },
  arrow: {
    fontFamily: "Montserrat_700Bold",
    color: "#000",
  },
  historyRow: {
  flexDirection: "row",
  alignItems: "center",
  width: "100%",
},

historyDotCol: {
  width: "8%",
  alignItems: "center",
},

historyStatusCol: {
  width: "24%",
  alignItems: "flex-start",
},

historyDateCol: {
  width: "34%",
  fontFamily: "Montserrat_700Bold",
  color: "#000",
},

historyRemarksCol: {
  width: "34%",
  fontFamily: "Montserrat_700Bold",
  color: "#000",
  textAlign: "left",
},
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  historyText: {
    flex: 1,
    fontFamily: "Montserrat_700Bold",
    color: "#000",
  },
  historyTextRight: {
    flex: 1,
    fontFamily: "Montserrat_700Bold",
    color: "#000",
    textAlign: "right",
  },
  mapImage: {
    width: "100%",
    borderRadius: 4,
    backgroundColor: "#d9d9d9",
    overflow: "hidden",
  },
  mapFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  locationFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 20,
    gap: 16,
  },
  locationText: {
    flex: 1,
    fontFamily: "Montserrat_700Bold",
    color: "#333",
    lineHeight: 24,
    paddingRight: 8,
  },
  mapButton: {
    borderWidth: 1,
    borderColor: "#9DE5A0",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  mapButtonText: {
    fontFamily: "Montserrat_700Bold",
    color: "#20B83B",
  },
  actionButton: {
    height: 42,
    borderWidth: 1,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  actionButtonText: {
    fontFamily: "Montserrat_700Bold",
  },
});