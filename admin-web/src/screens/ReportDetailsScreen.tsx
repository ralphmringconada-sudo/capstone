import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View, Image, useWindowDimensions, TouchableOpacity, ActivityIndicator, Linking } from "react-native";
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
import type { Report } from "@/types/admin";
import { formatDateTime } from "@/utils/format";

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
  const handleStatusUpdate = async (status: Report["status"], details: string) => {
    // Require both the target record and actor before a consequential report update.
    if (!report || !admin) return;
    setIsUpdating(true);
    setError("");
    // Persist the audited status decision before replacing the local report snapshot.
    try {
      await updateReportStatus(report.id, status, admin, details);
      const refreshed = await fetchReportById(report.id);
      setReport(refreshed);
      if (refreshed) {
        setImageUrls(await resolveReportImageUrls(refreshed));
      }
    // Leave the current evidence visible while reporting a failed moderation action.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update report.");
    } finally {
      setIsUpdating(false);
    }
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

  return (
    <AdminLayout activePage="Reports">
      <ScrollView
        style={styles.page}
        contentContainerStyle={{
          paddingHorizontal: width * 0.025,
          paddingTop: height * 0.035,
          paddingBottom: 30,
        }}
        showsVerticalScrollIndicator={false}
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
                    styles.pendingBadge,
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

              {[
  ["Pending", "May 20, 2026 · 9:10 AM", "Report submitted by user"],
  ["In Review", "—", "Pending"],
  ["Resolved", "—", "Pending"],
  ["Rejected", "—", "Pending"],
].map((item, index) => (
  <View key={index} style={[styles.historyRow, { minHeight: 42 * s }]}>
    <View style={styles.historyDotCol}>
      <View
        style={[
          styles.dot,
          index === 0 ? styles.activeDot : styles.inactiveDot,
        ]}
      />
    </View>

    <View style={styles.historyStatusCol}>
      <Text
        style={[
          styles.badge,
          historyBadgeColor(item[0]),
          {
            fontSize: 16 * s,
            paddingHorizontal: 9 * s,
            paddingVertical: 5 * s,
          },
        ]}
      >
        {item[0]}
      </Text>
    </View>

    <Text style={[styles.historyDateCol, { fontSize: 16 * s }]}>
      {item[1]}
    </Text>

    <Text style={[styles.historyRemarksCol, { fontSize: 16 * s }]}>
      {item[2]}
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

              <ActionButton
                text="Mark as In Review"
                color="#259BEF"
                icon={Check}
                s={s}
                onPress={() => handleStatusUpdate("In Review", "Marked report as in review")}
                disabled={isUpdating}
              />
              <ActionButton
                text="Mark as Resolved"
                color="#20B83B"
                icon={Check}
                s={s}
                onPress={() => handleStatusUpdate("Resolved", "Approved and resolved report")}
                disabled={isUpdating}
              />
              <ActionButton
                text="Reject Report"
                color="#FF3B3B"
                icon={X}
                s={s}
                onPress={() => handleStatusUpdate("Rejected", "Rejected report")}
                disabled={isUpdating}
              />
              <ActionButton
                text="Delete Report"
                color="#8B1E1E"
                icon={X}
                s={s}
                onPress={async () => {
                  // Require an existing report and authenticated audit actor before deletion.
                  if (!report || !admin) return;
                  setIsUpdating(true);
                  try {
                    // Load and execute the Firestore deletion service, then leave the removed record.
                    const { deleteReport } = await import("@/services/adminDataService");
                    await deleteReport(report.id, admin);
                    router.replace("/reports");
                  // Preserve the detail view and present any deletion or audit failure.
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to delete report.");
                  } finally {
                    setIsUpdating(false);
                  }
                }}
                disabled={isUpdating}
              />
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

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#fff",
  },
  pageTitle: {
    fontFamily: "Montserrat_700Bold",
    color: "#0B5A1E",
  },
  grid: {
    flexDirection: "row",
    width: "100%",
  },
  leftColumn: {
    flex: 1.15,
  },
  rightColumn: {
    flex: 1,
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
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: "Montserrat_700Bold",
    color: "#000",
  },
  infoRowTop: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#d6d6d6",
    paddingBottom: 14,
    marginBottom: 2,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#d6d6d6",
    paddingVertical: 13,
  },
  label: {
    width: "35%",
    fontFamily: "Montserrat_700Bold",
    color: "#000",
  },
  description: {
    flex: 1,
    fontFamily: "Montserrat_700Bold",
    color: "#333",
    lineHeight: 19,
  },
  valueText: {
    flex: 1,
    fontFamily: "Montserrat_700Bold",
    color: "#000",
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
    borderWidth: 1,
  },
  activeDot: {
    backgroundColor: "#F5B351",
    borderColor: "#E39A2E",
  },
  inactiveDot: {
    backgroundColor: "#fff",
    borderColor: "#aaa",
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
    alignItems: "center",
    marginTop: 12,
    gap: 10,
  },
  locationText: {
    flex: 1,
    fontFamily: "Montserrat_700Bold",
    color: "#333",
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