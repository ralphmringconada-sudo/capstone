import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  useWindowDimensions,
  Image,
  Modal,
} from "react-native";
import {
  ClipboardList,
  Clock,
  Check,
  ChevronDown,
  Eye,
  Search,
  Filter,
  X,
} from "lucide-react-native";
import { router } from "expo-router";
import AdminLayout from "../components/AdminLayout";
import DashboardCard from "../components/DashboardCard";
import DateRangeFilter from "@/components/DateRangeFilter";
import { useAdminData } from "@/hooks/useAdminData";
import { resolveReportImageUrls } from "@/services/reportImageService";
import { isWithinDateRange } from "@/utils/dateRange";
import { formatDateTime } from "@/utils/format";
import type { Report } from "@/types/admin";
import { Dropdown } from "react-native-element-dropdown";

const CATEGORIES = ["All Categories", "Deforestation", "Forest Fires", "Illegal Logging", "Waste Dumping", "Other"];
const STATUSES = ["All Statuses", "Pending", "In Review", "Resolved", "Rejected"];
const categoryData = CATEGORIES.map((item) => ({
  label: item,
  value: item,
}));

const statusData = STATUSES.map((item) => ({
  label: item,
  value: item,
}));
/**
 * Purpose: Enables administrators to search, review, and inspect environmental reports.
 * How it works:
 * 1. Shared Firestore-backed data supplies reports and summary statistics.
 * 2. Memoized text, category, and status filters derive the visible table.
 * 3. Evidence thumbnails are resolved for visible records and opened in a modal.
 * 4. Report details are available from each row (deletion is disabled).
 * Technologies Used: React hooks, React Native Web, Expo Router, Cloud Firestore services, and image URL handling.
 * Why this implementation: A unified workspace supports efficient report triage without duplicating backend state.
 */
export default function ReportsScreen() {
  const { width, height } = useWindowDimensions();
  const s = Math.min(width / 1920, height / 1080);
  const { reports, stats } = useAdminData();

  /*
   * Filter state derives the visible report set, menu state controls filter dialogs,
   * and thumbnail/viewer state manages evidence previews independently of report records.
   */
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All Categories");
  const [status, setStatus] = useState("All Statuses");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [viewerReport, setViewerReport] = useState<Report | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  const filteredReports = useMemo(() => {
    const queryText = search.trim().toLowerCase();
    return reports.filter((report) => {
      const matchesSearch =
        !queryText ||
        report.title.toLowerCase().includes(queryText) ||
        report.description.toLowerCase().includes(queryText) ||
        report.location.toLowerCase().includes(queryText) ||
        report.reportedByName.toLowerCase().includes(queryText) ||
        (report.reportedByEmail || "").toLowerCase().includes(queryText);

      const matchesCategory = category === "All Categories" || report.category === category;
      const matchesStatus = status === "All Statuses" || report.status === status;
      const matchesDate = isWithinDateRange(report.createdAt, fromDate, toDate);
      return matchesSearch && matchesCategory && matchesStatus && matchesDate;
    });
  }, [reports, search, category, status, fromDate, toDate]);

  /**
   * Purpose: Resolves and caches a representative evidence image for one report row.
   * How it works:
   * 1. Existing cache entries avoid repeated image-reference processing.
   * 2. The image service selects current paths or legacy report URLs.
   * 3. The first available reference is stored by report ID.
   * Technologies Used: React state, asynchronous JavaScript, and Firebase Storage-derived image references.
   * Why this implementation: Lazy row previews limit repeated work while preserving legacy evidence.
   */
  const ensureThumbnail = async (report: Report) => {
    if (thumbnails[report.id]) return;
    const urls = await resolveReportImageUrls(report);
    if (urls[0]) {
      setThumbnails((prev) => ({ ...prev, [report.id]: urls[0] }));
    }
  };

  useEffect(() => {
    // Resolve previews for only the first visible records to bound initial image work.
    filteredReports.slice(0, 20).forEach((report) => {
      ensureThumbnail(report);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredReports]);

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
        <Text style={[styles.pageTitle, { fontSize: 42 * s }]}>REPORTS</Text>
        <Text style={[styles.subtitle, { fontSize: 18 * s }]}>
          Manage and review all environmental reports submitted by users
        </Text>

        <View style={[styles.cards, { gap: width * 0.025, marginTop: height * 0.035 }]}>
          <DashboardCard title="Total Reports" value={String(stats.totalReports)} color="#DDEAD3" icon={ClipboardList} iconColor="#20B83B" />
          <DashboardCard title="In Review" value={String(stats.reportsInReview)} color="#CFE6FA" icon={Eye} iconColor="#259BEF" />
          <DashboardCard title="Pending" value={String(stats.pendingReports)} color="#FCEFCB" icon={Clock} iconColor="#000" />
          <DashboardCard title="Resolved" value={String(stats.resolvedReports)} color="#DDEAD3" icon={Check} iconColor="#43B64A" />
        </View>

        <View style={[styles.filterPanel, { marginTop: height * 0.025, padding: 14 * s }]}>
          <View style={styles.searchBox}>
            <TextInput
              placeholder="Search reports..."
              placeholderTextColor="#777"
              style={[styles.searchInput, { fontSize: 15 * s }]}
              value={search}
              onChangeText={setSearch}
            />
            <Search size={20 * s} color="#000" />
          </View>

          <View style={styles.filterBox}>
  <Dropdown
    style={styles.dropdown}
    containerStyle={styles.dropdownMenu}
    placeholderStyle={[
      styles.dropdownPlaceholder,
      { fontSize: 15 * s },
    ]}
    selectedTextStyle={[
      styles.dropdownText,
      { fontSize: 15 * s },
    ]}
    itemTextStyle={styles.dropdownItemText}
    activeColor="#EEF7EA"
    data={categoryData}
    labelField="label"
    valueField="value"
    value={category}
    placeholder="Select Category"
    maxHeight={280}
    onChange={(item) => setCategory(item.value)}
    renderRightIcon={() => (
      <ChevronDown
        size={17 * s}
        color="#3F3F3F"
        strokeWidth={2}
      />
    )}
    renderItem={(item) => {
      const selected = item.value === category;

      return (
        <View
          style={[
            styles.dropdownItem,
            selected && styles.dropdownItemSelected,
          ]}
        >
          <Text
            style={[
              styles.dropdownItemText,
              selected && styles.dropdownItemTextSelected,
            ]}
          >
            {item.label}
          </Text>

          {selected && (
            <Check
              size={15}
              color="#34733B"
              strokeWidth={2.5}
            />
          )}
        </View>
      );
    }}
  />
</View>

          <View style={styles.filterBox}>
  <Dropdown
    style={styles.dropdown}
    containerStyle={styles.dropdownMenu}
    placeholderStyle={[
      styles.dropdownPlaceholder,
      { fontSize: 15 * s },
    ]}
    selectedTextStyle={[
      styles.dropdownText,
      { fontSize: 15 * s },
    ]}
    itemTextStyle={styles.dropdownItemText}
    activeColor="#EEF7EA"
    data={statusData}
    labelField="label"
    valueField="value"
    value={status}
    placeholder="Select Status"
    maxHeight={280}
    onChange={(item) => setStatus(item.value)}
    renderRightIcon={() => (
      <ChevronDown
        size={17 * s}
        color="#3F3F3F"
        strokeWidth={2}
      />
    )}
    renderItem={(item) => {
      const selected = item.value === status;

      return (
        <View
          style={[
            styles.dropdownItem,
            selected && styles.dropdownItemSelected,
          ]}
        >
          <Text
            style={[
              styles.dropdownItemText,
              selected && styles.dropdownItemTextSelected,
            ]}
          >
            {item.label}
          </Text>

          {selected && (
            <Check
              size={15}
              color="#34733B"
              strokeWidth={2.5}
            />
          )}
        </View>
      );
    }}
  />
</View>

          <DateRangeFilter
            label="Date Reported"
            fromDate={fromDate}
            toDate={toDate}
            onChangeFrom={setFromDate}
            onChangeTo={setToDate}
          />

          <View style={styles.buttonColumn}>
            <TouchableOpacity
              style={styles.smallButton}
              onPress={() => {
                setSearch("");
                setCategory("All Categories");
                setStatus("All Statuses");
                setFromDate("");
                setToDate("");
              }}
            >
              <Filter size={14 * s} color="#34733B" />
              <Text style={[styles.buttonText, { fontSize: 14 * s }]}>Reset</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.tablePanel, { marginTop: height * 0.02 }]}>
          <ScrollView horizontal={width < 1100} showsHorizontalScrollIndicator={width < 1100}>
            <View style={[styles.table, width >= 1100 ? styles.tableFullWidth : null]}>
          <View style={[styles.tableHeader, { height: 48 * s }]}>
            <Text style={[styles.th, styles.idCol, { fontSize: 18 * s }]}>ID</Text>
            <Text style={[styles.th, styles.detailsCol, { fontSize: 18 * s }]}>Report Details</Text>
            <Text style={[styles.th, styles.locationCol, { fontSize: 18 * s }]}>Location</Text>
            <Text style={[styles.th, styles.categoryCol, { fontSize: 18 * s }]}>Category</Text>
            <Text style={[styles.th, styles.reportedCol, { fontSize: 18 * s }]}>Reported By</Text>
            <Text style={[styles.th, styles.dateCol, { fontSize: 18 * s }]}>Date Reported</Text>
            <Text style={[styles.th, styles.statusCol, { fontSize: 18 * s, transform: [{ translateX: 15 }] }]}>Status</Text>
            <Text style={[styles.th, styles.actionCol, { fontSize: 18 * s, transform: [{ translateX: 40 }] }]}>Action</Text>
          </View>

          {filteredReports.map((report) => {
            const submitted = formatDateTime(report.createdAt);
            return (
              <View key={report.id} style={[styles.tableRow, { minHeight: 88 * s }]}>
                <Text style={[styles.td, styles.idCol, { fontSize: 18 * s }]}>#{report.id.slice(0, 8)}</Text>

                <View style={[styles.detailsCol, styles.reportDetails]}>
                  <TouchableOpacity
                    onPress={() => {
                      if (!thumbnails[report.id]) return;
                      setViewerUri(thumbnails[report.id]);
                      setViewerReport(report);
                    }}
                    style={[styles.imageBox, { width: 48 * s, height: 48 * s }]}
                  >
                    {thumbnails[report.id] ? (
                      <Image source={{ uri: thumbnails[report.id] }} style={{ width: "100%", height: "100%" }} />
                    ) : null}
                  </TouchableOpacity>
                  <View style={styles.reportTextBox}>
                    <Text style={[styles.reportTitle, { fontSize: 16 * s }]}>{report.title}</Text>
                    <Text style={[styles.reportDesc, { fontSize: 12 * s }]} numberOfLines={2}>
                      {report.description}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.td, styles.locationCol, { fontSize: 16 * s }]} numberOfLines={3}>
                  {report.location}
                </Text>

                <View style={[styles.categoryCol, styles.badgeWrap]}>
                  <Text style={[styles.badge, categoryColor(report.category), { fontSize: 16 * s, paddingHorizontal: 8 * s, paddingVertical: 5 * s }]}>
                    {report.category}
                  </Text>
                </View>

                <View style={styles.reportedCol}>
                  <Text style={[styles.td, { fontSize: 16 * s }]}>{report.reportedByName}</Text>
                  <Text style={[styles.username, { fontSize: 13 * s }]}>{report.reportedByEmail || report.reportedByUid}</Text>
                </View>

                <View style={styles.dateCol}>
                  <Text style={[styles.td, { fontSize: 16 * s }]}>{submitted.date}</Text>
                  <Text style={[styles.username, { fontSize: 13 * s }]}>{submitted.time}</Text>
                </View>

                <View style={[styles.statusCol, styles.badgeWrap]}>
                  <Text style={[styles.badge, statusColor(report.status), { fontSize: 16 * s, paddingHorizontal: 8 * s, paddingVertical: 5 * s }]}>
                    {report.status}
                  </Text>
                </View>

                <View style={[styles.actionCol, styles.actions]}>
  <TouchableOpacity
    onPress={() =>
      router.navigate({
        pathname: "/report-details",
        params: { id: report.id },
      })
    }
    style={styles.viewReportButton}
  >
    <Eye
      size={14 * s}
      color="#34733B"
      strokeWidth={2.2}
    />

    <Text
      style={[
        styles.viewReportButtonText,
        { fontSize: 12 * s },
      ]}
    >
      View Report
    </Text>
  </TouchableOpacity>
</View>
              </View>
            );
          })}
            </View>
          </ScrollView>

          <View style={[styles.paginationRow, { padding: 18 * s }]}>
            <Text style={[styles.showing, { fontSize: 16 * s }]}>
              Showing {filteredReports.length} of {stats.totalReports} reports
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal transparent visible={Boolean(viewerUri)} animationType="fade">
        <View style={styles.viewerOverlay}>
          <TouchableOpacity
            style={styles.viewerClose}
            onPress={() => {
              setViewerUri(null);
              setViewerReport(null);
            }}
          >
            <X size={24} color="#fff" />
          </TouchableOpacity>
          {viewerUri ? (
            <View style={styles.viewerContent}>
              <Image source={{ uri: viewerUri }} style={styles.viewerImage} resizeMode="contain" />
              {viewerReport ? (
                <View style={styles.viewerMetadata}>
                  <Text style={styles.viewerMetadataText}>
                    Captured: {viewerReport.imageTimestamp || "Not recorded"}
                  </Text>
                  <Text style={styles.viewerMetadataText}>
                    {viewerReport.imageLocation || viewerReport.location}
                  </Text>
                  {viewerReport.coordinates ? (
                    <Text style={styles.viewerMetadataText}>
                      GPS: {viewerReport.coordinates.latitude.toFixed(6)},{" "}
                      {viewerReport.coordinates.longitude.toFixed(6)}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </Modal>
    </AdminLayout>
  );
}

/**
 * Purpose: Maps report categories to consistent table badge colors.
 * How it works:
 * 1. Category keywords select water, forest, illegal-activity, or fallback colors.
 * 2. The selected style object is applied without modifying the report value.
 * Technologies Used: TypeScript string matching and React Native style objects.
 * Why this implementation: Semantic color improves category recognition in dense report tables.
 */
function categoryColor(category: string) {
  if (category.includes("Water")) return { backgroundColor: "#D7B9EA", color: "#6B168F" };
  if (category.includes("Forest") || category.includes("Deforestation")) return { backgroundColor: "#C8E6C9", color: "#2E7D32" };
  if (category.includes("Illegal")) return { backgroundColor: "#FFCDD2", color: "#C62828" };
  return { backgroundColor: "#FFF9C4", color: "#F9A825" };
}

/**
 * Purpose: Maps each report workflow status to a semantic table badge.
 * How it works:
 * 1. Pending, in-review, and resolved values select dedicated colors.
 * 2. Remaining statuses use the rejection presentation.
 * Technologies Used: TypeScript conditionals and React Native style objects.
 * Why this implementation: Stable status colors make moderation progress easier to scan.
 */
function statusColor(status: string) {
  if (status === "Pending") return { backgroundColor: "#FFF0B8", color: "#D99A00" };
  if (status === "In Review") return { backgroundColor: "#C7DDFF", color: "#315BC9" };
  if (status === "Resolved") return { backgroundColor: "#BFEBC5", color: "#168A18" };
  return { backgroundColor: "#FFD0D0", color: "#D83030" };
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#fff" },
  pageTitle: { fontFamily: "Montserrat_700Bold", color: "#0B5A1E" },
  subtitle: { fontFamily: "Montserrat_700Bold", color: "#555", marginTop: 6 },
  cards: { flexDirection: "row" },
  filterPanel: {
    borderWidth: 1,
    borderColor: "#d6d6d6",
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    flexWrap: "wrap",
  },
  searchBox: {
    flex: 1.4,
    minWidth: 180,
    borderWidth: 1,
    borderColor: "#d6d6d6",
    borderRadius: 6,
    paddingHorizontal: 12,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
  },
  searchInput: { flex: 1, fontFamily: "Montserrat_700Bold", outlineStyle: "none" as any },

  filterBox: {
  minWidth: 180,
  height: 48,
  borderWidth: 1,
  borderColor: "#D6D6D6",
  borderRadius: 7,
  paddingHorizontal: 12,
  justifyContent: "center",
  backgroundColor: "#FFFFFF",
  cursor: "pointer",
} as any,

  dateBox: {
    minWidth: 160,
    borderWidth: 1,
    borderColor: "#d6d6d6",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  
  dateInner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  filterLabel: {
  fontFamily: "Montserrat_700Bold",
  color: "#777",
  fontSize: 12,
  marginBottom: 2,
},
  filterText: { fontFamily: "Montserrat_700Bold", color: "#111" },
  buttonColumn: { justifyContent: "center" },
  smallButton: {
    borderWidth: 1,
    borderColor: "#9DE5A0",
    borderRadius: 6,
    paddingHorizontal: 12,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  buttonText: { fontFamily: "Montserrat_700Bold", color: "#34733B" },
  tablePanel: { borderWidth: 1, borderColor: "#d6d6d6", borderRadius: 8, overflow: "hidden" },
  table: { minWidth: 1100 },
  tableFullWidth: { minWidth: "100%", width: "100%" },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F7F1",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#d6d6d6",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#ececec",
  },
  th: { fontFamily: "Montserrat_700Bold", color: "#111" },
  td: { fontFamily: "Montserrat_700Bold", color: "#222" },
  idCol: {
  flex: 0.75,
  minWidth: 85,
  paddingRight: 8,
},

detailsCol: {
  flex: 1.25,
  minWidth: 210,
  paddingLeft: 14,
  paddingRight: 4,
},

locationCol: {
  flex: 1.45,
  minWidth: 150,
  paddingLeft: 4,
  paddingRight: 10,
},

categoryCol: {
  flex: 1.1,
  minWidth: 125,
},

reportedCol: {
  flex: 1.3,
  minWidth: 145,
},

dateCol: {
  flex: 1.1,
  minWidth: 120,
},

statusCol: {
  flex: 1,
  minWidth: 105,
},

actionCol: {
  flex: 0.9,
  minWidth: 115,
  alignItems: "center",
  justifyContent: "center",
},

  reportDetails: {
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
},

viewReportButton: {
  minHeight: 30,

  borderWidth: 1,
  borderColor: "#4B9B52",
  borderRadius: 6,

  backgroundColor: "#FFFFFF",

  paddingHorizontal: 9,
  paddingVertical: 5,

  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",

  gap: 5,

  cursor: "pointer",
} as any,

viewReportButtonText: {
  color: "#34733B",

  fontFamily: "Montserrat_700Bold",

  whiteSpace: "nowrap",
} as any,

  imageBox: { backgroundColor: "#ddd", borderRadius: 6, overflow: "hidden" },
  reportTextBox: { flex: 1 },
  reportTitle: { fontFamily: "Montserrat_700Bold", color: "#111" },
  reportDesc: { fontFamily: "Montserrat_700Bold", color: "#666", marginTop: 2 },
  username: { fontFamily: "Montserrat_700Bold", color: "#777" },
  badgeWrap: { alignItems: "flex-start" },
  badge: { borderRadius: 5, overflow: "hidden", fontFamily: "Montserrat_700Bold" },
  actions: { flexDirection: "row", gap: 8 },
  paginationRow: { flexDirection: "row", justifyContent: "space-between" },
  showing: { fontFamily: "Montserrat_700Bold", color: "#555" },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  menuCard: { width: 280, backgroundColor: "#fff", borderRadius: 8, paddingVertical: 8 },
  menuItem: { paddingHorizontal: 16, paddingVertical: 12 },
  menuText: { fontFamily: "Montserrat_700Bold", color: "#111" },
  viewerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewerClose: { position: "absolute", top: 24, right: 24, zIndex: 2 },
  viewerContent: { width: "70%", height: "82%", alignItems: "center" },
  viewerImage: { width: "100%", height: "78%" },
  viewerMetadata: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d8e3d4",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 10,
  },
  viewerMetadataText: {
    color: "#263b28",
    fontFamily: "Montserrat_700Bold",
    fontSize: 14,
    lineHeight: 20,
  },

// =====================================================
// DROPDOWNS
// =====================================================

dropdown: {
  flex: 1,
  width: "100%",
  height: "100%",
  justifyContent: "center",
  cursor: "pointer",
  outlineStyle: "none",
} as any,

dropdownPlaceholder: {
  fontFamily: "Montserrat_700Bold",
  color: "#555555",
},

dropdownText: {
  fontFamily: "Montserrat_700Bold",
  color: "#222222",
},

dropdownMenu: {
  marginTop: 5,
  backgroundColor: "#FFFFFF",
  borderWidth: 1,
  borderColor: "#D3D3D3",
  borderRadius: 8,
  overflow: "hidden",
  shadowColor: "#000000",
  shadowOffset: {
    width: 0,
    height: 5,
  },
  shadowOpacity: 0.14,
  shadowRadius: 10,
  elevation: 10,
},

dropdownItem: {
  minHeight: 43,
  paddingHorizontal: 13,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  backgroundColor: "#FFFFFF",
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: "#ECECEC",
  cursor: "pointer",
} as any,

dropdownItemSelected: {
  backgroundColor: "#EEF7EA",
},

dropdownItemText: {
  flex: 1,
  fontSize: 13,
  color: "#333333",
  fontFamily: "Montserrat_700Bold",
},

dropdownItemTextSelected: {
  color: "#276C30",
  fontFamily: "Montserrat_700Bold",
},

});