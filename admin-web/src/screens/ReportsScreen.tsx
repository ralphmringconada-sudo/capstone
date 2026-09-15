import { createElement, useEffect, useMemo, useState } from "react";
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
  Platform,
} from "react-native";
import {
  ClipboardList,
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
import { useAdminData } from "@/hooks/useAdminData";
import { resolveReportImageUrls } from "@/services/reportImageService";
import { isWithinDateRange } from "@/utils/dateRange";
import { formatDateTime } from "@/utils/format";
import type { Report } from "@/types/admin";

const CATEGORIES = ["All Categories", "Deforestation", "Forest Fires", "Illegal Logging", "Waste Dumping", "Other"];
const STATUSES = ["All Statuses", "Pending", "In Review", "Resolved", "Rejected"];
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
  const [openFilter, setOpenFilter] = useState<"category" | "status" | null>(null);

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

  // Show a maximum of 5 reports per page.
  const reportsPerPage = 5;
  const [reportPage, setReportPage] = useState(1);

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

  const reportPageCount = Math.max(
    1,
    Math.ceil(filteredReports.length / reportsPerPage),
  );

  const currentReportPage = Math.min(
    reportPage,
    reportPageCount,
  );

  const visibleReports = filteredReports.slice(
    (currentReportPage - 1) * reportsPerPage,
    currentReportPage * reportsPerPage,
  );

  useEffect(() => {
    setReportPage(1);
  }, [search, category, status, fromDate, toDate]);

  const filteredStats = useMemo(() => {
  const queryText = search.trim().toLowerCase();

  // Base set only considers search + date.
  // Category and status are counted separately so their cards stay meaningful.
  const baseReports = reports.filter((report) => {
    const matchesSearch =
      !queryText ||
      report.title.toLowerCase().includes(queryText) ||
      report.description.toLowerCase().includes(queryText) ||
      report.location.toLowerCase().includes(queryText) ||
      report.reportedByName.toLowerCase().includes(queryText) ||
      (report.reportedByEmail || "").toLowerCase().includes(queryText);

    const matchesDate = isWithinDateRange(
      report.createdAt,
      fromDate,
      toDate,
    );

    return matchesSearch && matchesDate;
  });

  const categoryCount =
    category === "All Categories"
      ? baseReports.length
      : baseReports.filter(
          (report) => report.category === category,
        ).length;

  const statusCount =
    status === "All Statuses"
      ? baseReports.length
      : baseReports.filter(
          (report) => report.status === status,
        ).length;

  return {
    totalReports: filteredReports.length,
    categoryCount,
    statusCount,
  };
}, [
  reports,
  filteredReports,
  search,
  category,
  status,
  fromDate,
  toDate,
]);

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
    // Resolve previews only for the reports shown on the current page.
    visibleReports.forEach((report) => {
      ensureThumbnail(report);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleReports]);

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
  keyboardShouldPersistTaps="handled"
>
        <Text style={[styles.pageTitle, { fontSize: 42 * s }]}>REPORTS</Text>
        <Text style={[styles.subtitle, { fontSize: 18 * s }]}>
          Manage and review all environmental reports submitted by users
        </Text>

        <View
  style={[
    styles.cards,
    {
      gap: width * 0.025,
      marginTop: height * 0.035,
    },
  ]}
>
  <DashboardCard
    title="Total Reports"
    value={String(filteredStats.totalReports)}
    color="#DDEAD3"
    icon={ClipboardList}
    iconColor="#20B83B"
  />

  <DashboardCard
    title={
      category === "All Categories"
        ? "All Categories"
        : category
    }
    value={String(filteredStats.categoryCount)}
    color="#FCEFCB"
    icon={Filter}
    iconColor="#D99A00"
  />

  <DashboardCard
    title={
      status === "All Statuses"
        ? "All Statuses"
        : status
    }
    value={String(filteredStats.statusCount)}
    color="#CFE6FA"
    icon={Eye}
    iconColor="#259BEF"
  />
</View>
      <View
        style={[
          styles.filterPanel,
          { marginTop: height * 0.025 },
        ]}
      >
          <View style={styles.searchBox}>
            <TextInput
              placeholder="Search reports..."
              placeholderTextColor="#777"
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
            />
            <Search size={17} color="#555" />
          </View>

          <FilterDropdown
            label="Category"
            value={category}
            options={CATEGORIES}
            isOpen={openFilter === "category"}
            onToggle={() =>
              setOpenFilter((current) =>
                current === "category" ? null : "category",
              )
            }
            onClose={() => setOpenFilter(null)}
            onChange={(value: string) => {
              setCategory(value);
            }}
          />

          <FilterDropdown
            label="Status"
            value={status}
            options={STATUSES}
            isOpen={openFilter === "status"}
            onToggle={() =>
              setOpenFilter((current) =>
                current === "status" ? null : "status",
              )
            }
            onClose={() => setOpenFilter(null)}
            onChange={(value: string) => {
              setStatus(value);
            }}
          />

          <DateRangeBox
            label="Date Reported"
            fromDate={fromDate}
            toDate={toDate}
            onChangeFrom={setFromDate}
            onChangeTo={setToDate}
          />

          <TouchableOpacity
            style={styles.smallButton}
            onPress={() => {
              setSearch("");
              setCategory("All Categories");
              setStatus("All Statuses");
              setOpenFilter(null);
              setFromDate("");
              setToDate("");
            }}
          >
            <Filter size={16} color="#43884C" />
            <Text style={styles.buttonText}>Reset</Text>
          </TouchableOpacity>
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

          {visibleReports.map((report) => {
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
        { fontSize: 15 * s },
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
              Showing{" "}
              {filteredReports.length
                ? (currentReportPage - 1) * reportsPerPage + 1
                : 0}{" "}
              to{" "}
              {Math.min(
                currentReportPage * reportsPerPage,
                filteredReports.length,
              )}{" "}
              of {filteredReports.length} reports
            </Text>

            <View style={styles.paginationButtons}>
              <TouchableOpacity
                style={styles.paginationButton}
                disabled={currentReportPage === 1}
                onPress={() =>
                  setReportPage((value) =>
                    Math.max(1, value - 1)
                  )
                }
              >
                <Text
                  style={[
                    styles.paginationText,
                    currentReportPage === 1 &&
                      styles.paginationTextDisabled,
                  ]}
                >
                  ‹
                </Text>
              </TouchableOpacity>

              {Array.from(
                { length: reportPageCount },
                (_, index) => index + 1,
              ).map((number) => (
                <TouchableOpacity
                  key={number}
                  style={[
                    styles.paginationButton,
                    currentReportPage === number &&
                      styles.paginationButtonActive,
                  ]}
                  onPress={() => setReportPage(number)}
                >
                  <Text
                    style={[
                      styles.paginationText,
                      currentReportPage === number &&
                        styles.paginationTextActive,
                    ]}
                  >
                    {number}
                  </Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={styles.paginationButton}
                disabled={currentReportPage === reportPageCount}
                onPress={() =>
                  setReportPage((value) =>
                    Math.min(reportPageCount, value + 1)
                  )
                }
              >
                <Text
                  style={[
                    styles.paginationText,
                    currentReportPage === reportPageCount &&
                      styles.paginationTextDisabled,
                  ]}
                >
                  ›
                </Text>
              </TouchableOpacity>
            </View>
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


function FilterDropdown({
  label,
  value,
  options,
  isOpen,
  onToggle,
  onClose,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <View
      style={[
        styles.dropdownContainer,
        isOpen && styles.dropdownContainerOpen,
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel={`${label} filter. Selected: ${value}`}
        accessibilityState={{ expanded: isOpen }}
        style={[
          styles.filterBox,
          isOpen && styles.filterBoxOpen,
        ]}
        onPress={onToggle}
      >
        <Text style={styles.filterLabel}>
          {label}
        </Text>

        <View style={styles.filterValueRow}>
          <Text
            numberOfLines={1}
            style={[
              styles.filterValue,
              isOpen && styles.filterValueOpen,
            ]}
          >
            {value}
          </Text>

          <ChevronDown
            size={16}
            color={isOpen ? "#34733B" : "#333333"}
            strokeWidth={2}
            style={{
              transform: [
                {
                  rotate: isOpen ? "180deg" : "0deg",
                },
              ],
            }}
          />
        </View>
      </TouchableOpacity>

      {isOpen ? (
        <View style={styles.dropdownMenu}>
          {options.map((option) => {
            const selected = option === value;

            return (
              <TouchableOpacity
                key={option}
                activeOpacity={0.75}
                accessibilityRole="menuitem"
                style={[
                  styles.dropdownItem,
                  selected && styles.dropdownItemSelected,
                ]}
                onPress={() => {
                  onChange(option);
                  onClose();
                }}
              >
                <Text
                  style={[
                    styles.dropdownText,
                    selected && styles.dropdownTextSelected,
                  ]}
                >
                  {option}
                </Text>

                {selected ? (
                  <Check
                    size={16}
                    color="#34733B"
                    strokeWidth={2.5}
                  />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}


// =========================================================
// DATE RANGE FILTER
// Matches Events / Users filter design
// =========================================================

function DateRangeBox({
  label,
  fromDate,
  toDate,
  onChangeFrom,
  onChangeTo,
}: {
  label: string;
  fromDate: string;
  toDate: string;
  onChangeFrom: (value: string) => void;
  onChangeTo: (value: string) => void;
}) {
  return (
    <View style={styles.dateRangeBox}>
      <Text style={styles.dateRangeLabel}>
        {label}
      </Text>

      <View style={styles.dateRangeInputRow}>
        <View style={styles.dateRangeSingleBox}>
          {Platform.OS === "web"
            ? createElement("input", {
                type: "date",
                value: fromDate,
                "aria-label": "From date",
                onChange: (event: {
                  target: {
                    value: string;
                  };
                }) => onChangeFrom(event.target.value),
                style: dateRangeWebInputStyle,
              })
            : (
              <TextInput
                value={fromDate}
                onChangeText={onChangeFrom}
                placeholder="From date"
                placeholderTextColor="#888888"
                style={styles.dateRangeNativeInput}
              />
            )}
        </View>

        <Text style={styles.dateRangeSeparator}>–</Text>

        <View style={styles.dateRangeSingleBox}>
          {Platform.OS === "web"
            ? createElement("input", {
                type: "date",
                value: toDate,
                min: fromDate || undefined,
                "aria-label": "To date",
                onChange: (event: {
                  target: {
                    value: string;
                  };
                }) => onChangeTo(event.target.value),
                style: dateRangeWebInputStyle,
              })
            : (
              <TextInput
                value={toDate}
                onChangeText={onChangeTo}
                placeholder="To date"
                placeholderTextColor="#888888"
                style={styles.dateRangeNativeInput}
              />
            )}
        </View>
      </View>
    </View>
  );
}

const dateRangeWebInputStyle = {
  width: "100%",
  height: 23,
  minWidth: 0,
  maxWidth: "100%",
  border: "none",
  outline: "none",
  padding: 0,
  margin: 0,
  fontSize: 10,
  lineHeight: "23px",
  color: "#252525",
  backgroundColor: "transparent",
  boxSizing: "border-box" as const,
  fontFamily: "Montserrat_700Bold",
  cursor: "pointer",
};

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
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9DEDA",
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    position: "relative",
    zIndex: 50,
    overflow: "visible",
  },

  searchBox: {
    height: 52,
    flexGrow: 1.35,
    flexShrink: 1,
    flexBasis: 250,
    minWidth: 220,
    borderWidth: 1,
    borderColor: "#D9DEDA",
    borderRadius: 8,
    backgroundColor: "#F7F8F7",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    color: "#252525",
    fontFamily: "Montserrat_700Bold",
    outlineStyle: "none" as any,
  },

  dropdownContainer: {
    height: 52,
    flexGrow: 0.8,
    flexShrink: 1,
    flexBasis: 165,
    minWidth: 155,
    position: "relative",
    zIndex: 100,
    overflow: "visible",
  },

  dropdownContainerOpen: {
    zIndex: 1000,
  },

  filterBox: {
    width: "100%",
    height: 52,
    borderRadius: 8,
    backgroundColor: "#F7F8F7",
    borderWidth: 1,
    borderColor: "#D9DEDA",
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: "center",
    cursor: "pointer",
  } as any,

  filterBoxOpen: {
    borderColor: "#34733B",
    backgroundColor: "#F7FBF5",
  },

  filterLabel: {
    fontFamily: "Montserrat_700Bold",
    color: "#686F68",
    marginBottom: 2,
    fontSize: 10,
    lineHeight: 12,
  },

  filterValueRow: {
    minHeight: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  filterValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: "Montserrat_700Bold",
    color: "#252525",
  },

  filterValueOpen: {
    color: "#34733B",
  },

  dateRangeBox: {
    height: 52,
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 300,
    minWidth: 286,
    maxWidth: 320,
    borderRadius: 8,
    backgroundColor: "#F7F8F7",
    borderWidth: 1,
    borderColor: "#D9DEDA",
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 5,
    justifyContent: "center",
    overflow: "hidden",
  },

  dateRangeLabel: {
    fontSize: 10,
    lineHeight: 12,
    color: "#686F68",
    fontFamily: "Montserrat_700Bold",
    marginBottom: 2,
  },

  dateRangeInputRow: {
    height: 27,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 5,
  },

  dateRangeSingleBox: {
    width: 128,
    height: 27,
    borderWidth: 1,
    borderColor: "#CDD3CD",
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 7,
    justifyContent: "center",
    overflow: "hidden",
  },

  dateRangeSeparator: {
    width: 10,
    textAlign: "center",
    fontSize: 11,
    lineHeight: 14,
    color: "#656B65",
    fontFamily: "Montserrat_700Bold",
  },

  dateRangeNativeInput: {
    width: "100%",
    minWidth: 0,
    height: 23,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    fontSize: 10,
    color: "#252525",
    fontFamily: "Montserrat_700Bold",
  },

  smallButton: {
    width: 94,
    height: 52,
    flexShrink: 0,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#D9DEDA",
    borderRadius: 8,
    backgroundColor: "#F7F8F7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    cursor: "pointer",
  } as any,

  buttonText: {
    fontSize: 12,
    fontFamily: "Montserrat_700Bold",
    color: "#34733B",
  },

  tablePanel: { borderWidth: 1, borderColor: "#d6d6d6", borderRadius: 8, overflow: "hidden", position: "relative", zIndex: 1 },
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
  paddingLeft: 12,
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
  paginationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  showing: {
    fontFamily: "Montserrat_700Bold",
    color: "#555",
  },

  paginationButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5,
  },

  paginationButton: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: "#A9B3A9",
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },

  paginationButtonActive: {
    backgroundColor: "#34733B",
    borderColor: "#34733B",
  },

  paginationText: {
    fontSize: 12,
    fontFamily: "Montserrat_700Bold",
    color: "#34733B",
  },

  paginationTextActive: {
    color: "#FFFFFF",
  },

  paginationTextDisabled: {
    color: "#A5ACA5",
  },
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
// Matches Events / Users
// =====================================================

dropdownMenu: {
  position: "absolute",
  top: 56,
  left: 0,
  right: 0,
  backgroundColor: "#FFFFFF",
  borderRadius: 8,
  borderWidth: 1,
  borderColor: "#D5D5D5",
  overflow: "hidden",
  zIndex: 2000,
  elevation: 10,
  shadowColor: "#000000",
  shadowOpacity: 0.14,
  shadowRadius: 9,
  shadowOffset: {
    width: 0,
    height: 4,
  },
},

dropdownItem: {
  minHeight: 42,
  paddingVertical: 11,
  paddingHorizontal: 14,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  backgroundColor: "#FFFFFF",
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: "#ECECEC",
  cursor: "pointer",
} as any,

dropdownItemSelected: {
  backgroundColor: "#F1F8EE",
},

dropdownText: {
  flex: 1,
  fontSize: 13,
  fontFamily: "Montserrat_700Bold",
  color: "#222222",
},

dropdownTextSelected: {
  color: "#34733B",
},

});